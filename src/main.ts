import { Modal, Notice, Plugin, Setting } from "obsidian";
import { ChangeQueue } from "./core/ChangeQueue";
import type { VaultChange } from "./core/types";
import { GoogleDriveAuth } from "./providers/googleDriveAuth";
import { GoogleTokenManager } from "./providers/googleTokenManager";
import type { StoredTokenEnvelope } from "./providers/encryptedTokenVault";
import { CloudVaultSettingTab, DEFAULT_SETTINGS, type CloudVaultSettings } from "./settings";

interface PersistedData {
  settings?: Partial<CloudVaultSettings>;
  queue?: VaultChange[];
  googleOAuthPending?: { state: string; verifier: string; createdAt: number };
  googleTokenEnvelope?: StoredTokenEnvelope;
}

export default class CloudVaultSyncPlugin extends Plugin {
  settings: CloudVaultSettings = DEFAULT_SETTINGS;
  private queue = new ChangeQueue();
  private auth = new GoogleDriveAuth();
  private saveTimer: number | undefined;
  private googleOAuthPending: PersistedData["googleOAuthPending"];
  private googleTokenEnvelope?: StoredTokenEnvelope;
  private tokenManager?: GoogleTokenManager;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    this.settings = this.mergeSettings(data?.settings);
    this.queue.restore(data?.queue ?? []);
    this.googleOAuthPending = data?.googleOAuthPending;
    this.googleTokenEnvelope = data?.googleTokenEnvelope;
    this.tokenManager = this.createTokenManager();

    this.addSettingTab(new CloudVaultSettingTab(this.app, this as this & {
      settings: CloudVaultSettings;
      saveSettings: () => Promise<void>;
      connectGoogleDrive: () => Promise<void>;
      unlockGoogleDrive: () => Promise<void>;
      lockGoogleDrive: () => void;
      hasGoogleDriveCredentials: () => boolean;
      isGoogleDriveUnlocked: () => boolean;
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
    this.tokenManager?.lock();
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    void this.persist();
  }

  async saveSettings(): Promise<void> {
    this.tokenManager = this.createTokenManager();
    await this.persist();
  }

  hasGoogleDriveCredentials(): boolean { return Boolean(this.googleTokenEnvelope); }
  isGoogleDriveUnlocked(): boolean { return this.tokenManager?.isUnlocked() ?? false; }

  lockGoogleDrive(): void {
    this.tokenManager?.lock();
    new Notice("Google Drive credentials locked in memory.");
  }

  async unlockGoogleDrive(): Promise<void> {
    if (!this.tokenManager || !this.googleTokenEnvelope) {
      new Notice("Connect Google Drive first.");
      return;
    }
    const passphrase = await this.requestPassphrase("Unlock Google Drive credentials", false);
    if (!passphrase) return;
    try {
      await this.tokenManager.unlock(passphrase);
      new Notice("Google Drive credentials unlocked. Sync is not active yet.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not unlock Google Drive.");
    }
  }

  private createTokenManager(): GoogleTokenManager {
    return new GoogleTokenManager(this.settings.googleDriveClientId, {
      read: async () => this.googleTokenEnvelope,
      write: async envelope => {
        this.googleTokenEnvelope = envelope;
        await this.persist();
      },
    });
  }

  private requestPassphrase(title: string, confirm: boolean): Promise<string | null> {
    return new Promise(resolve => {
      let settled = false;
      const modal = new class extends Modal {
        onOpen(): void {
          this.titleEl.setText(title);
          const input = this.contentEl.createEl("input", {
            attr: { type: "password", autocomplete: confirm ? "new-password" : "current-password" },
          });
          input.style.width = "100%";
          input.placeholder = "At least 12 characters";
          let confirmation: HTMLInputElement | undefined;
          if (confirm) {
            confirmation = this.contentEl.createEl("input", {
              attr: { type: "password", autocomplete: "new-password" },
            });
            confirmation.style.width = "100%";
            confirmation.style.marginTop = "8px";
            confirmation.placeholder = "Confirm passphrase";
          }
          new Setting(this.contentEl)
            .addButton(button => button.setButtonText("Continue").setCta().onClick(() => {
              if (input.value.length < 12) {
                new Notice("Use at least 12 characters for the encryption passphrase.");
                return;
              }
              if (confirmation && input.value !== confirmation.value) {
                new Notice("The passphrases do not match.");
                return;
              }
              settled = true;
              resolve(input.value);
              this.close();
            }))
            .addExtraButton(button => button.setIcon("cross").setTooltip("Cancel").onClick(() => this.close()));
          input.focus();
        }
        onClose(): void {
          this.contentEl.empty();
          if (!settled) resolve(null);
        }
      }(this.app);
      modal.open();
    });
  }

  async connectGoogleDrive(): Promise<void> {
    try {
      const redirect = new URL(this.settings.googleDriveRedirectUri);
      if (redirect.protocol !== "obsidian:" || redirect.hostname !== "cloudvault-sync-oauth") {
        throw new Error("Use the redirect URI obsidian://cloudvault-sync-oauth so Obsidian can receive the OAuth callback.");
      }
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
      const passphrase = await this.requestPassphrase("Create your CloudVault encryption passphrase", true);
      if (!passphrase) {
        new Notice("Google authorization was not saved. Connect again to retry.");
        return;
      }
      const tokens = await this.auth.exchangeCode(params.code, this.settings.googleDriveClientId,
        this.settings.googleDriveRedirectUri, pending.verifier);
      await this.tokenManager?.saveAuthorization(tokens, passphrase);
      this.googleOAuthPending = undefined;
      await this.persist();
      new Notice("Google credentials encrypted and saved on this device. Sync is not active yet.");
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
    await this.saveData({
      settings: this.settings,
      queue: this.queue.list(),
      googleOAuthPending: this.googleOAuthPending,
      googleTokenEnvelope: this.googleTokenEnvelope,
    });
  }

  private showStatus(): void {
    new Notice(`CloudVault Sync · ${this.queue.size} local change(s) queued. Provider sync is not enabled until secure token storage and conflict-safe transfer are complete.`, 7000);
  }
}
