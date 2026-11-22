import type { PendingPayloadStore, ResumableUploadState, ResumableUploadStateStore } from "./googleDriveTransfer";

export interface BinaryStorageAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Stores only encrypted upload payloads in a private plugin-owned vault folder. */
export class ObsidianPendingPayloadStore implements PendingPayloadStore {
  private readonly root = ".cloudvault-sync/pending";

  constructor(private readonly adapter: BinaryStorageAdapter) {}

  async put(key: string, payload: Uint8Array): Promise<string> {
    await this.ensureDirectory();
    const reference = `${this.root}/${encodeURIComponent(key).replace(/%/g, "_")}-${Date.now()}.bin`;
    const copy = new Uint8Array(payload.byteLength);
    copy.set(payload);
    await this.adapter.writeBinary(reference, copy.buffer);
    return reference;
  }

  async get(reference: string): Promise<Uint8Array | undefined> {
    if (!await this.adapter.exists(reference)) return undefined;
    return new Uint8Array(await this.adapter.readBinary(reference));
  }

  async remove(reference: string): Promise<void> {
    if (await this.adapter.exists(reference)) await this.adapter.remove(reference);
  }

  private async ensureDirectory(): Promise<void> {
    if (!await this.adapter.exists(".cloudvault-sync")) await this.adapter.mkdir(".cloudvault-sync");
    if (!await this.adapter.exists(this.root)) await this.adapter.mkdir(this.root);
  }
}

/** Persists resumable session metadata through the plugin's encrypted-payload-only data store. */
export class PluginDataUploadStateStore implements ResumableUploadStateStore {
  private states = new Map<string, ResumableUploadState>();

  constructor(
    initial: ResumableUploadState[],
    private readonly save: (states: ResumableUploadState[]) => Promise<void>,
  ) {
    for (const state of initial) this.states.set(state.path, state);
  }

  async get(path: string): Promise<ResumableUploadState | undefined> {
    const state = this.states.get(path);
    return state ? { ...state } : undefined;
  }

  async set(state: ResumableUploadState): Promise<void> {
    this.states.set(state.path, { ...state });
    await this.flush();
  }

  async remove(path: string): Promise<void> {
    this.states.delete(path);
    await this.flush();
  }

  list(): ResumableUploadState[] {
    return [...this.states.values()].map(state => ({ ...state }));
  }

  private async flush(): Promise<void> {
    await this.save(this.list());
  }
}
