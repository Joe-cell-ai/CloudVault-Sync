export type ChangeKind = "create" | "modify" | "delete" | "rename";

export interface VaultChange {
  id: string;
  path: string;
  previousPath?: string;
  kind: ChangeKind;
  queuedAt: number;
}

export interface ProviderStatus {
  id: "mega" | "onedrive" | "google-drive";
  enabled: boolean;
  connected: boolean;
  lastSyncAt?: number;
  lastError?: string;
}

export interface SyncSnapshot {
  queuedChanges: number;
  providers: ProviderStatus[];
  lastActivity?: string;
}

export interface RemoteFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  modifiedTime: string;
  etag?: string;
  size?: number;
  trashed?: boolean;
}

export interface RemoteChangeCursor {
  pageToken?: string;
  startPageToken?: string;
}

export interface ConflictRecord {
  id: string;
  path: string;
  localModifiedAt: number;
  remoteModifiedAt: string;
  remoteFileId: string;
  detectedAt: number;
}
