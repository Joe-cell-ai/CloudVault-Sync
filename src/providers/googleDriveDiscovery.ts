export interface GoogleDriveEncryptedFile {
  id: string;
  opaqueName: string;
  pathHash: string;
  modifiedTime: string;
  size?: number;
}

export interface GoogleDriveEncryptedFilePage {
  files: GoogleDriveEncryptedFile[];
  nextPageToken?: string;
}

/** Lists only CloudVault ciphertext objects; it never requests or exposes file contents. */
export class GoogleDriveDiscovery {
  constructor(
    private readonly accessToken: () => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listEncryptedFiles(folderId: string, pageToken?: string): Promise<GoogleDriveEncryptedFilePage> {
    if (!folderId.trim()) throw new Error("A Google Drive destination folder is required.");
    const token = await this.accessToken();
    const params = new URLSearchParams({
      q: `'${folderId.replace(/\\\\/g, "\\\\'")}' in parents and trashed = false and appProperties has { key='cloudvaultEncrypted' and value='1' }`,
      pageSize: "100",
      orderBy: "modifiedTime desc",
      fields: "nextPageToken,files(id,name,modifiedTime,size,appProperties)",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await this.fetcher(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Google Drive discovery failed (${response.status}).`);
    const body = await response.json() as {
      files?: Array<{ id?: string; name?: string; modifiedTime?: string; size?: string; appProperties?: Record<string, string> }>;
      nextPageToken?: string;
    };
    const files = (body.files ?? []).flatMap(file => {
      const pathHash = file.appProperties?.cloudvaultPathHash;
      if (!file.id || !file.name || !pathHash || file.appProperties?.cloudvaultFormat !== "1") return [];
      return [{
        id: file.id,
        opaqueName: file.name,
        pathHash,
        modifiedTime: file.modifiedTime ?? "",
        size: file.size === undefined ? undefined : Number(file.size),
      }];
    });
    return { files, nextPageToken: body.nextPageToken };
  }

  async listAllEncryptedFiles(folderId: string): Promise<GoogleDriveEncryptedFile[]> {
    const files: GoogleDriveEncryptedFile[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.listEncryptedFiles(folderId, pageToken);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }
}
