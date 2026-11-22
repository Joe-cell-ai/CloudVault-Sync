import type { RemoteFile, RemoteChangeCursor } from "../core/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export interface GoogleDriveChange {
  fileId: string;
  removed: boolean;
  file?: RemoteFile;
}

export class GoogleDriveProvider {
  constructor(private readonly accessToken: () => Promise<string>) {}

  private async request<T>(path: string): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
    return await response.json() as T;
  }

  async getStartPageToken(): Promise<RemoteChangeCursor> {
    const result = await this.request<{ startPageToken: string }>("/changes/startPageToken");
    return { startPageToken: result.startPageToken };
  }

  async listChanges(pageToken: string): Promise<{
    changes: GoogleDriveChange[];
    nextPageToken?: string;
    newStartPageToken?: string;
  }> {
    const query = new URLSearchParams({
      pageToken,
      spaces: "drive",
      includeRemoved: "true",
      fields: "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,etag,size,trashed,parents))",
    });
    const result = await this.request<{
      nextPageToken?: string;
      newStartPageToken?: string;
      changes?: GoogleDriveChange[];
    }>(`/changes?${query}`);
    return {
      changes: result.changes ?? [],
      nextPageToken: result.nextPageToken,
      newStartPageToken: result.newStartPageToken,
    };
  }

  async listVaultFiles(folderId: string): Promise<RemoteFile[]> {
    const files: RemoteFile[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        pageSize: "1000",
        orderBy: "folder,name",
        fields: "files(id,name,mimeType,modifiedTime,etag,size,trashed,parents),nextPageToken",
      });
      if (pageToken) query.set("pageToken", pageToken);
      const result = await this.request<{ files?: RemoteFile[]; nextPageToken?: string }>(`/files?${query}`);
      files.push(...(result.files ?? []));
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }
}
