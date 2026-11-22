import { Notice, Plugin } from "obsidian";
import { ChangeQueue } from "./core/ChangeQueue";
import type { VaultChange } from "./core/types";
import { GoogleDriveAuth } from "./providers/googleDriveAuth";
import { CloudVaultSettingTab, DEFAULT_SETTINGS, type CloudVaultSettings } from "./settings";

interface PersistedData {
  settings?: Partial<CloudVaultSettings>;
  queue?: VaultChange[];
  googleOAuthPending?: { state: string; verifier: string; createdAt: number };
}

export default class CloudVaultSyncPlugin extends Plugin {
  settings: CloudVaultSettings = DEFAULT_SETTINGS;
  private queue = new ChangeQueue();
  private auth = new GoogleDriveAuth();
  private saveTimer: number | undefined;
  private googleOAuthPending: PersistedData["googleOAuthPending"];

  async onload(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    this.settings = this.mergeSettings(data?.settings);
    this.queue.restore(data?.queue ?? []);
    this.googleOAuthPending = data?.googleOAuthPending;

    this.addSettingTab(new CloudVaultSettingTab(this.app, this as this & {
      settings: CloudVaultSettings;
      saveSettings: () => Promise<void>;
      connectGoogleDrive: () => Promise<void>;
    }));

    if (this.settings.showRibbonIcon) this.addRibbonIcon("cloud", "CloudVault Sync status", () => this.showStatus());
    this.registerEvent(this.app.vault.on("create", file => this.record("create", file.path)));
    this.registerEvent(this.app.vault.on("modify", file => this.record("modify", file.path)));
    this.registerEvent(this.app.vault.on("delete", file => this.record("delete", file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.record("rename", file.path, oldPath)));

    this.registerObsidianProtocolHandler("cloudvault-sync-oauth", async params => {
      await this.handleGoogleOAuthCallback(params);
    });
    this.addCommand({ id: "show-sync-status", name: "Show sync status", callback: () => this.showStatus() });
    this.addCommand({ id: "save-local-queue", name: "Save local change queue", callback: async () => {
      await this.persist();
      new Notice("CloudVault Sync: local queue saved.");
    }});
  }

  onunload(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    void this.persist();
  }

  async saveSettings(): Promise<void> { await this.persist(); }

  async connectGoogleDrive(): Promise<void> {
    try {
      const { url, pending } = await this.auth.createAuthorizationUrl(
        this.settings.googleDriveClientId,
        this.settings.googleDriveRedirectUri,
      );
      this.googleOAuthPending = pending;
      await this.persist();
      window.open(url, "_blank", "noopener");
      new Notice("Complete Google authorization, then return through your registered redirect URI.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not start Google authorization.");
    }
  }

  private async handleGoogleOAuthCallback(params: Record<string, string>): Promise<void> {
    const pending = this.googleOAuthPending;
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      new Notice("Google authorization expired. Start Connect again.");
      return;
    }
    if (params.state !== pending.state) {
      new Notice("Google authorization state did not match. No account was connected.");
      return;
    }
    if (!params.code) {
      new Notice(params.error ? `Google authorization failed: ${params.error}` : "Google did not return an authorization code.");
      return;
    }
    try {
      await this.auth.exchangeCode(params.code, this.settings.googleDriveClientId,
        this.settings.googleDriveRedirectUri, pending.verifier);
      this.googleOAuthPending = undefined;
      await this.persist();
      new Notice("Google authorization code exchanged. Secure token storage is not yet enabled; sync remains disabled.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Google authorization could not be completed.");
    }
  }

  private mergeSettings(partial?: Partial<CloudVaultSettings>): CloudVaultSettings {
    return { ...DEFAULT_SETTINGS, ...partial, providers: { ...DEFAULT_SETTINGS.providers, ...partial?.providers } };
  }

  private record(kind: VaultChange["kind"], path: string, previousPath?: string): void {
    if (!this.settings.enableChangeTracking) return;
    this.queue.enqueue({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, kind, path, previousPath, queuedAt: Date.now() });
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.saveTimer = undefined; void this.persist(); }, 500);
  }

  private async persist(): Promise<void> {
    await this.saveData({ settings: this.settings, queue: this.queue.list(), googleOAuthPending: this.googleOAuthPending });
  }

  private showStatus(): void {
    new Notice(`CloudVault Sync · ${this.queue.size} local change(s) queued. Provider sync is not enabled until secure token storage and conflict-safe transfer are complete.`, 7000);
  }
}
