const GRAPH = "https://graph.microsoft.com/v1.0";

export interface OneDriveItem {
  id: string;
  name: string;
  eTag?: string;
  cTag?: string;
  lastModifiedDateTime?: string;
  size?: number;
  file?: { mimeType?: string };
  deleted?: { state?: string };
  parentReference?: { driveId?: string };
}
export interface OneDriveDeltaPage {
  value: OneDriveItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

/** Independent Microsoft Graph adapter. Callers must pass encrypted bytes only. */
export class OneDriveProvider {
  constructor(private readonly accessToken: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetcher(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`Microsoft OneDrive request failed (${response.status}).`);
    return response;
  }

  async listDelta(deltaUrl?: string): Promise<{ items: OneDriveItem[]; nextLink?: string; deltaLink?: string }> {
    const url = deltaUrl ?? `${GRAPH}/me/drive/root/delta`;
    const response = await this.request(url);
    const page = await response.json() as OneDriveDeltaPage;
    return { items: page.value ?? [], nextLink: page["@odata.nextLink"], deltaLink: page["@odata.deltaLink"] };
  }

  async uploadEncrypted(pathHash: string, encryptedBytes: Uint8Array, existingItemId?: string): Promise<OneDriveItem> {
    if (!/^cloudvault-[a-f0-9]{64}$/.test(pathHash)) throw new Error("Invalid opaque CloudVault path key.");
    const url = existingItemId
      ? `${GRAPH}/me/drive/items/${encodeURIComponent(existingItemId)}/content`
      : `${GRAPH}/me/drive/root:/${pathHash}.cvault:/content`;
    const response = await this.request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: encryptedBytes as BodyInit,
    });
    return await response.json() as OneDriveItem;
  }

  async downloadEncrypted(itemId: string): Promise<Uint8Array> {
    const response = await this.request(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
