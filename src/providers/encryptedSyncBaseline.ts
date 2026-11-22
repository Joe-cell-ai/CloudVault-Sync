import { EncryptedFileVault } from "./encryptedFileVault";

export interface SyncBaselineEntry {
  path: string;
  localContentHash: string;
  remoteFileId: string;
  remoteRevision: string;
  remoteModifiedTime?: string;
  lastSyncedAt: number;
}

export interface SyncBaselineStore {
  read(): Promise<string | undefined>;
  write(ciphertextBase64: string): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Content fingerprint used only for change detection; never sent to a provider. */
export async function hashFileContent(content: Uint8Array): Promise<string> {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Encrypted per-path sync baselines. No plaintext paths or fingerprints in plugin data. */
export class EncryptedSyncBaseline {
  private readonly encryption = new EncryptedFileVault();

  constructor(private readonly store: SyncBaselineStore) {}

  async record(
    entry: Omit<SyncBaselineEntry, "localContentHash" | "lastSyncedAt"> & {
      localContent: Uint8Array;
      lastSyncedAt?: number;
    },
    passphrase: string,
  ): Promise<SyncBaselineEntry> {
    const path = normalizeVaultPath(entry.path);
    const remoteFileId = entry.remoteFileId.trim();
    const remoteRevision = entry.remoteRevision.trim();
    if (!remoteFileId || !remoteRevision) {
      throw new Error("A baseline requires a remote file ID and revision.");
    }
    const baseline: SyncBaselineEntry = {
      path,
      localContentHash: await hashFileContent(entry.localContent),
      remoteFileId,
      remoteRevision,
      remoteModifiedTime: entry.remoteModifiedTime,
      lastSyncedAt: entry.lastSyncedAt ?? Date.now(),
    };
    const entries = await this.readEntries(passphrase);
    entries[path] = baseline;
    await this.writeEntries(entries, passphrase);
    return { ...baseline };
  }

  async get(path: string, passphrase: string): Promise<SyncBaselineEntry | undefined> {
    const entry = (await this.readEntries(passphrase))[normalizeVaultPath(path)];
    return entry ? { ...entry } : undefined;
  }

  async list(passphrase: string): Promise<SyncBaselineEntry[]> {
    return Object.values(await this.readEntries(passphrase)).map(entry => ({ ...entry }));
  }

  async remove(path: string, passphrase: string): Promise<void> {
    const entries = await this.readEntries(passphrase);
    delete entries[normalizeVaultPath(path)];
    await this.writeEntries(entries, passphrase);
  }

  private async readEntries(passphrase: string): Promise<Record<string, SyncBaselineEntry>> {
    const stored = await this.store.read();
    if (!stored) return {};
    const plaintext = await this.encryption.decrypt(fromBase64(stored), passphrase);
    const parsed = JSON.parse(decoder.decode(plaintext)) as Record<string, SyncBaselineEntry>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The encrypted CloudVault sync baseline is invalid.");
    }
    return parsed;
  }

  private async writeEntries(entries: Record<string, SyncBaselineEntry>, passphrase: string): Promise<void> {
    const encrypted = await this.encryption.encrypt(encoder.encode(JSON.stringify(entries)), passphrase);
    await this.store.write(toBase64(encrypted));
  }
}

function normalizeVaultPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").normalize("NFC").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("The sync baseline requires a safe vault-relative path.");
  }
  return normalized;
}
