import type { RemoteFile, RemoteChangeCursor } from "../core/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export class GoogleDriveProvider {
  constructor(private readonly accessToken: () => Promise<string>) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`${DRIVE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body instanceof Blob ? { "Content-Type": "application/octet-stream" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
    return await response.json() as T;
  }

  async getStartPageToken(): Promise<RemoteChangeCursor> {
    const result = await this.request<{ startPageToken: string }>("/changes/startPageToken");
    return { startPageToken: result.startPageToken };
  }

  async listChanges(pageToken: string): Promise<{ files: RemoteFile[]; nextPageToken?: string; newStartPageToken?: string }> {
    const query = new URLSearchParams({
      pageToken,
      spaces: "drive",
      includeRemoved: "true",
      fields: "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,etag,size,trashed,parents))",
    });
    const result = await this.request<{
      nextPageToken?: string;
      newStartPageToken?: string;
      changes?: Array<{ fileId: string; removed?: boolean; file?: RemoteFile }>;
    }>(`/changes?${query}`);
    return {
      files: (result.changes ?? []).filter(change => !change.removed && change.file).map(change => change.file as RemoteFile),
      nextPageToken: result.nextPageToken,
      newStartPageToken: result.newStartPageToken,
    };
  }

  async listVaultFiles(folderId: string): Promise<RemoteFile[]> {
    const query = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      pageSize: "1000",
      orderBy: "folder,name",
      fields: "files(id,name,mimeType,modifiedTime,etag,size,trashed,parents),nextPageToken",
    });
    const result = await this.request<{ files?: RemoteFile[] }>(`/files?${query}`);
    return result.files ?? [];
  }
}
