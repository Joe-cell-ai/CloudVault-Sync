import { EncryptedFileVault } from "./encryptedFileVault";
import { hashVaultPath } from "./encryptedPathManifest";
import { OneDriveProvider, type OneDriveItem } from "./oneDriveProvider";
import type { SyncProvider, SyncRemoteFile } from "../core/SyncCoordinator";

function asRemote(item: OneDriveItem): SyncRemoteFile | undefined {
  const match = item.name.match(/^(cloudvault-[a-f0-9]{64})\.cvault$/);
  if (!item.id || !match || item.deleted) return undefined;
  return {
    id: item.id,
    name: item.name,
    path: match[1],
    pathHash: match[1],
    mimeType: item.file?.mimeType ?? "application/octet-stream",
    modifiedTime: item.lastModifiedDateTime ?? "",
    etag: item.eTag,
    revision: item.eTag ?? item.cTag ?? item.lastModifiedDateTime ?? item.id,
    size: item.size,
  };
}

/** Bridges Microsoft Graph delta/content APIs to the shared encrypted sync engine. */
export class OneDriveSyncAdapter implements SyncProvider {
  private readonly encryption = new EncryptedFileVault();
  constructor(private readonly provider: OneDriveProvider, private readonly passphrase: () => string) {}

  async listChanges(cursor?: string): Promise<{ files: SyncRemoteFile[]; removedIds: string[]; nextCursor?: string }> {
    const page = await this.provider.listDelta(cursor);
    return {
      files: page.items.map(asRemote).filter((item): item is SyncRemoteFile => Boolean(item)),
      removedIds: page.items.filter(item => Boolean(item.deleted)).map(item => item.id),
      nextCursor: page.nextLink ?? page.deltaLink,
    };
  }

  async upload(path: string, bytes: Uint8Array, existing?: SyncRemoteFile): Promise<SyncRemoteFile> {
    const pathHash = await hashVaultPath(path);
    const encrypted = await this.encryption.encrypt(bytes, this.passphrase());
    const item = await this.provider.uploadEncrypted(pathHash, encrypted, existing?.id);
    const remote = asRemote(item);
    if (!remote) throw new Error("Microsoft OneDrive returned invalid CloudVault file metadata.");
    return remote;
  }

  async download(file: SyncRemoteFile): Promise<Uint8Array> {
    const encrypted = await this.provider.downloadEncrypted(file.id);
    return this.encryption.decrypt(encrypted, this.passphrase());
  }
}
