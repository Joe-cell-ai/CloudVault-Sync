import { detectConflict, type SyncBaseline, type SyncConflict, type SyncObservation } from "./ConflictDetector";
import { hashFileContent, type EncryptedSyncBaseline } from "../providers/encryptedSyncBaseline";
import type { RemoteChangeCursor, RemoteFile, VaultChange } from "./types";

export interface SyncLocalFile {
  path: string;
  exists: boolean;
  modifiedAt?: number;
  read(): Promise<Uint8Array>;
  write(data: Uint8Array): Promise<void>;
}
export interface SyncRemoteFile extends RemoteFile {
  revision: string;
  pathHash: string;
}
export interface SyncProvider {
  listChanges(cursor?: string): Promise<{ files: SyncRemoteFile[]; removedIds: string[]; nextCursor?: string }>;
  upload(path: string, bytes: Uint8Array, existing?: SyncRemoteFile): Promise<SyncRemoteFile>;
  download(file: SyncRemoteFile): Promise<Uint8Array>;
}
export interface SyncStateStore {
  readCursor(providerId: string): Promise<string | undefined>;
  writeCursor(providerId: string, cursor: string): Promise<void>;
  readConflicts(): Promise<SyncConflict[]>;
  writeConflicts(conflicts: SyncConflict[]): Promise<void>;
}
export interface ConflictResolver {
  resolve(conflict: SyncConflict): Promise<"keep-local" | "keep-remote" | "defer">;
}
export interface SyncCoordinatorOptions {
  providerId: string;
  provider: SyncProvider;
  baselines: EncryptedSyncBaseline;
  state: SyncStateStore;
  local: (path: string) => Promise<SyncLocalFile>;
  pathForRemote: (file: SyncRemoteFile) => Promise<string | undefined>;
  passphrase: () => string;
  resolver: ConflictResolver;
  now?: () => number;
}

/**
 * Reconciles one provider change page at a time. The remote cursor advances only
 * after every item on the page has been handled, so a failed transfer is retried.
 * Deletions are intentionally not propagated automatically.
 */
export class SyncCoordinator {
  private running = false;
  constructor(private readonly options: SyncCoordinatorOptions) {}

  async syncOnce(): Promise<{ uploaded: number; downloaded: number; conflicts: number }> {
    if (this.running) throw new Error("A synchronization cycle is already running.");
    this.running = true;
    try {
      const cursor = await this.options.state.readCursor(this.options.providerId);
      const page = await this.options.provider.listChanges(cursor);
      let uploaded = 0;
      let downloaded = 0;
      let conflicts = 0;
      const pendingConflicts = await this.options.state.readConflicts();

      for (const remote of page.files) {
        const path = await this.options.pathForRemote(remote);
        if (!path) continue;
        const local = await this.options.local(path);
        const localBytes = local.exists ? await local.read() : new Uint8Array();
        const baseline = await this.options.baselines.get(path, this.options.passphrase());
        const localHash = local.exists ? await hashFileContent(localBytes) : undefined;
        const observation: SyncObservation = {
          path,
          localExists: local.exists,
          localModifiedAt: local.modifiedAt,
          localRevision: localHash,
          remoteExists: true,
          remoteModifiedAt: remote.modifiedTime,
          remoteRevision: remote.revision,
        };
        const decision = detectConflict(toDetectorBaseline(baseline), observation);
        if (decision.action === "upload-local") {
          const result = await this.options.provider.upload(path, localBytes, remote);
          await this.options.baselines.record({
            path, localContent: localBytes, remoteFileId: result.id, remoteRevision: result.revision,
            remoteModifiedTime: result.modifiedTime,
          }, this.options.passphrase());
          uploaded++;
        } else if (decision.action === "download-remote") {
          const bytes = await this.options.provider.download(remote);
          await local.write(bytes);
          await this.options.baselines.record({
            path, localContent: bytes, remoteFileId: remote.id, remoteRevision: remote.revision,
            remoteModifiedTime: remote.modifiedTime,
          }, this.options.passphrase());
          downloaded++;
        } else if (decision.action === "conflict") {
          conflicts++;
          if (!pendingConflicts.some(item => item.id === decision.conflict.id || item.path === path)) {
            pendingConflicts.push(decision.conflict);
          }
          const choice = await this.options.resolver.resolve(decision.conflict);
          if (choice === "keep-local") {
            const result = await this.options.provider.upload(path, localBytes, remote);
            await this.options.baselines.record({
              path, localContent: localBytes, remoteFileId: result.id, remoteRevision: result.revision,
              remoteModifiedTime: result.modifiedTime,
            }, this.options.passphrase());
            pendingConflicts.splice(0, pendingConflicts.length, ...pendingConflicts.filter(item => item.path !== path));
            uploaded++;
          } else if (choice === "keep-remote") {
            const bytes = await this.options.provider.download(remote);
            await local.write(bytes);
            await this.options.baselines.record({
              path, localContent: bytes, remoteFileId: remote.id, remoteRevision: remote.revision,
              remoteModifiedTime: remote.modifiedTime,
            }, this.options.passphrase());
            pendingConflicts.splice(0, pendingConflicts.length, ...pendingConflicts.filter(item => item.path !== path));
            downloaded++;
          }
        }
      }
      await this.options.state.writeConflicts(pendingConflicts);
      if (page.nextCursor) await this.options.state.writeCursor(this.options.providerId, page.nextCursor);
      return { uploaded, downloaded, conflicts };
    } finally {
      this.running = false;
    }
  }
}

function toDetectorBaseline(entry: Awaited<ReturnType<EncryptedSyncBaseline["get"]>>): SyncBaseline | undefined {
  if (!entry) return undefined;
  return {
    path: entry.path,
    localModifiedAt: entry.lastSyncedAt,
    remoteModifiedAt: entry.remoteModifiedTime ?? "",
    localRevision: entry.localContentHash,
    remoteRevision: entry.remoteRevision,
  };
}
