import { EncryptedFileVault } from "./encryptedFileVault";

const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const CHUNK_SIZE = 8 * 1024 * 1024; // multiple of Google's 256 KiB alignment

async function opaqueRemoteName(path: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path)));
  return "cloudvault-" + [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export interface PendingPayloadStore {
  put(key: string, payload: Uint8Array): Promise<string>;
  get(reference: string): Promise<Uint8Array | undefined>;
  remove(reference: string): Promise<void>;
}

export interface ResumableUploadState {
  path: string;
  fileName: string;
  folderId: string;
  mimeType: string;
  payloadReference: string;
  sessionUrl?: string;
  offset: number;
  totalBytes: number;
  createdAt: number;
}

export interface ResumableUploadStateStore {
  get(path: string): Promise<ResumableUploadState | undefined>;
  set(state: ResumableUploadState): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface GoogleDriveUploadedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

/**
 * Encrypted Google Drive transfers. Upload payloads are encrypted before a
 * resumable session is created. The caller supplies durable stores for both
 * pending ciphertext and session metadata so uploads can survive restarts.
 */
export class GoogleDriveTransfer {
  private readonly encryption = new EncryptedFileVault();

  constructor(
    private readonly accessToken: () => Promise<string>,
    private readonly payloads: PendingPayloadStore,
    private readonly sessions: ResumableUploadStateStore,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async uploadEncryptedFile(
    path: string,
    fileName: string,
    plaintext: Uint8Array,
    folderId: string,
    passphrase: string,
    mimeType = "application/octet-stream",
  ): Promise<GoogleDriveUploadedFile> {
    if (await this.sessions.get(path)) {
      throw new Error("An upload is already pending for this path. Resume or cancel it before starting another.");
    }
    const encrypted = await this.encryption.encrypt(plaintext, passphrase);
    const payloadReference = await this.payloads.put(path, encrypted);
    const state: ResumableUploadState = {
      path, fileName, folderId, mimeType, payloadReference,
      offset: 0, totalBytes: encrypted.byteLength, createdAt: Date.now(),
    };
    await this.sessions.set(state);
    return this.resumeUpload(path);
  }

  async resumeUpload(path: string): Promise<GoogleDriveUploadedFile> {
    const state = await this.sessions.get(path);
    if (!state) throw new Error("No resumable upload exists for this path.");
    const payload = await this.payloads.get(state.payloadReference);
    if (!payload || payload.byteLength !== state.totalBytes) {
      throw new Error("The encrypted pending upload is missing or incomplete; the original file was not changed.");
    }

    if (!state.sessionUrl) {
      const token = await this.accessToken();
      const metadata = {
        name: await opaqueRemoteName(state.path),
        mimeType: "application/octet-stream",
        parents: [state.folderId],
        appProperties: {
          cloudvaultEncrypted: "1",
          cloudvaultFormat: "1",
          cloudvaultPathHash: await opaqueRemoteName(state.path),
        },
      };
      const start = await this.fetcher(`${UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size,appProperties`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(state.totalBytes),
        },
        body: JSON.stringify(metadata),
      });
      if (!start.ok) throw new Error(`Could not start encrypted upload (${start.status}).`);
      const location = start.headers.get("Location");
      if (!location) throw new Error("Google Drive did not return a resumable upload URL.");
      state.sessionUrl = location;
      await this.sessions.set(state);
    }

    while (state.offset < state.totalBytes) {
      const end = Math.min(state.offset + CHUNK_SIZE, state.totalBytes) - 1;
      const chunk = payload.slice(state.offset, end + 1);
      const token = await this.accessToken();
      const response = await this.fetcher(state.sessionUrl!, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${state.offset}-${end}/${state.totalBytes}`,
        },
        body: chunk,
      });

      if (response.status === 308) {
        const range = response.headers.get("Range");
        state.offset = range ? Number(range.match(/-(\d+)$/)?.[1] ?? -1) + 1 : 0;
        await this.sessions.set(state);
        continue;
      }
      if (!response.ok) throw new Error(`Encrypted upload paused at byte ${state.offset} (${response.status}); retry with Resume.`);
      const uploaded = await response.json() as GoogleDriveUploadedFile;
      await this.payloads.remove(state.payloadReference);
      await this.sessions.remove(path);
      return uploaded;
    }
    throw new Error("Upload session ended without a confirmed Google Drive file response.");
  }

  async downloadEncryptedFile(fileId: string, passphrase: string): Promise<Uint8Array> {
    const token = await this.accessToken();
    const response = await this.fetcher(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Encrypted download failed (${response.status}).`);
    return this.encryption.decrypt(new Uint8Array(await response.arrayBuffer()), passphrase);
  }
}

/** Writes downloaded bytes without overwriting an existing vault file. */
export interface SafeVaultWriter {
  exists(path: string): Promise<boolean>;
  createBinary(path: string, data: ArrayBuffer): Promise<unknown>;
}

export async function restoreWithoutOverwrite(
  vault: SafeVaultWriter,
  path: string,
  plaintext: Uint8Array,
  now = new Date(),
): Promise<{ path: string; createdAsConflictCopy: boolean }> {
  let target = path;
  if (await vault.exists(path)) {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const dot = path.lastIndexOf(".");
    const base = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
    const extension = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
    target = `${base}.cloudvault-conflict-${stamp}${extension}`;
    let suffix = 1;
    while (await vault.exists(target)) {
      target = `${base}.cloudvault-conflict-${stamp}-${suffix++}${extension}`;
    }
  }
  const copy = new Uint8Array(plaintext.byteLength);
  copy.set(plaintext);
  await vault.createBinary(target, copy.buffer);
  return { path: target, createdAsConflictCopy: target !== path };
}
