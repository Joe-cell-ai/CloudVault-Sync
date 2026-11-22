import { EncryptedFileVault } from "./encryptedFileVault";

export interface PathManifestEntry {
  pathHash: string;
  vaultPath: string;
  remoteFileId?: string;
  remoteModifiedTime?: string;
  lastUploadedAt: number;
}

export interface PathManifestStore {
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

/** Stable, opaque provider-side key. The original vault path never leaves this device. */
export async function hashVaultPath(path: string): Promise<string> {
  const normalized = path.replace(/\\/g, "/").normalize("NFC");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(normalized)));
  return "cloudvault-" + [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Encrypted local mapping from opaque provider hashes to real vault paths. */
export class EncryptedPathManifest {
  private readonly encryption = new EncryptedFileVault();

  constructor(private readonly store: PathManifestStore) {}

  async record(
    path: string,
    passphrase: string,
    remote?: { fileId?: string; modifiedTime?: string },
  ): Promise<PathManifestEntry> {
    const entries = await this.readEntries(passphrase);
    const pathHash = await hashVaultPath(path);
    return this.recordRemote(pathHash, path, passphrase, remote);
  }

  async recordRemote(
    pathHash: string,
    vaultPath: string,
    passphrase: string,
    remote?: { fileId?: string; modifiedTime?: string },
  ): Promise<PathManifestEntry> {
    if (!/^cloudvault-[a-f0-9]{64}$/.test(pathHash)) {
      throw new Error("Invalid CloudVault remote path hash.");
    }
    const normalizedPath = vaultPath.replace(/\\\\/g, "/").replace(/^\\/+/, "");
    if (!normalizedPath || normalizedPath.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("The vault path manifest requires a safe vault-relative path.");
    }
    const entries = await this.readEntries(passphrase);
    const entry: PathManifestEntry = {
      pathHash,
      vaultPath: normalizedPath,
      remoteFileId: remote?.fileId,
      remoteModifiedTime: remote?.modifiedTime,
      lastUploadedAt: Date.now(),
    };
    entries[pathHash] = entry;
    await this.writeEntries(entries, passphrase);
    return entry;
  }

  async resolve(pathHash: string, passphrase: string): Promise<PathManifestEntry | undefined> {
    const entries = await this.readEntries(passphrase);
    const entry = entries[pathHash];
    return entry ? { ...entry } : undefined;
  }

  async list(passphrase: string): Promise<PathManifestEntry[]> {
    return Object.values(await this.readEntries(passphrase)).map(entry => ({ ...entry }));
  }

  private async readEntries(passphrase: string): Promise<Record<string, PathManifestEntry>> {
    const stored = await this.store.read();
    if (!stored) return {};
    const plaintext = await this.encryption.decrypt(fromBase64(stored), passphrase);
    const parsed = JSON.parse(decoder.decode(plaintext)) as Record<string, PathManifestEntry>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The encrypted CloudVault path manifest is invalid.");
    }
    return parsed;
  }

  private async writeEntries(entries: Record<string, PathManifestEntry>, passphrase: string): Promise<void> {
    const encrypted = await this.encryption.encrypt(encoder.encode(JSON.stringify(entries)), passphrase);
    await this.store.write(toBase64(encrypted));
  }
}
