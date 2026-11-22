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
