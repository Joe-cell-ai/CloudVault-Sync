import type { Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";

export interface CloudVaultSettings {
  enableChangeTracking: boolean;
  showRibbonIcon: boolean;
  googleDriveClientId: string;
  googleDriveRedirectUri: string;
  googleDriveFolderId: string;
  providers: { mega: boolean; oneDrive: boolean; googleDrive: boolean };
}

export const DEFAULT_SETTINGS: CloudVaultSettings = {
  enableChangeTracking: true,
  showRibbonIcon: true,
  googleDriveClientId: "",
  googleDriveRedirectUri: "",
  googleDriveFolderId: "",
  providers: { mega: false, oneDrive: false, googleDrive: false },
};

export class CloudVaultSettingTab extends PluginSettingTab {
  plugin: Plugin & {
    settings: CloudVaultSettings;
    saveSettings: () => Promise<void>;
    connectGoogleDrive: () => Promise<void>;
    unlockGoogleDrive: () => Promise<void>;
    lockGoogleDrive: () => void;
    hasGoogleDriveCredentials: () => boolean;
    isGoogleDriveUnlocked: () => boolean;
  };

  constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: Plugin & {
    settings: CloudVaultSettings;
    saveSettings: () => Promise<void>;
    connectGoogleDrive: () => Promise<void>;
    unlockGoogleDrive: () => Promise<void>;
    lockGoogleDrive: () => void;
    hasGoogleDriveCredentials: () => boolean;
    isGoogleDriveUnlocked: () => boolean;
  }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CloudVault Sync" });
    containerEl.createEl("p", { text: "Google Drive integration is being introduced in stages. Configure an OAuth client ID from your Google Cloud project; no client secret is stored by this plugin." });

    new Setting(containerEl)
      .setName("Track local vault changes")
      .setDesc("Record file changes locally for synchronization.")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.enableChangeTracking).onChange(async value => {
        this.plugin.settings.enableChangeTracking = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async value => {
        this.plugin.settings.showRibbonIcon = value;
        await this.plugin.saveSettings();
      }));

    containerEl.createEl("h3", { text: "Google Drive" });
    new Setting(containerEl)
      .setName("OAuth client ID")
      .setDesc("Google OAuth client ID. Use a client configuration that supports your registered redirect URI.")
      .addText(text => text.setPlaceholder("xxxx.apps.googleusercontent.com")
        .setValue(this.plugin.settings.googleDriveClientId)
        .onChange(async value => {
          this.plugin.settings.googleDriveClientId = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Redirect URI")
      .setDesc("Use obsidian://cloudvault-sync-oauth and register the exact URI with an OAuth client that permits this redirect scheme.")
      .addText(text => text.setPlaceholder("obsidian://cloudvault-sync-oauth")
        .setValue(this.plugin.settings.googleDriveRedirectUri)
        .onChange(async value => {
          this.plugin.settings.googleDriveRedirectUri = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Destination folder ID")
      .setDesc("Google Drive folder ID where encrypted vault files will be uploaded.")
      .addText(text => text.setPlaceholder("Google Drive folder ID")
        .setValue(this.plugin.settings.googleDriveFolderId)
        .onChange(async value => {
          this.plugin.settings.googleDriveFolderId = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Connect Google Drive")
      .setDesc("Starts OAuth with PKCE. Credentials are encrypted locally. Use the Obsidian command palette to upload the active file encrypted or resume pending uploads.")
      .addButton(button => button.setButtonText("Connect").onClick(async () => {
        await this.plugin.connectGoogleDrive();
      }));

    const credentialState = !this.plugin.hasGoogleDriveCredentials()
      ? "Not connected"
      : this.plugin.isGoogleDriveUnlocked() ? "Connected · unlocked in memory" : "Connected · locked";
    containerEl.createEl("p", { text: `Google Drive credentials: ${credentialState}` });
    if (this.plugin.hasGoogleDriveCredentials()) {
      new Setting(containerEl)
        .setName("Unlock Google Drive")
        .setDesc("Unlocks the locally encrypted token bundle for this Obsidian session.")
        .addButton(button => button.setButtonText("Unlock").setDisabled(this.plugin.isGoogleDriveUnlocked()).onClick(async () => {
          await this.plugin.unlockGoogleDrive();
          this.display();
        }))
        .addButton(button => button.setButtonText("Lock").setDisabled(!this.plugin.isGoogleDriveUnlocked()).onClick(() => {
          this.plugin.lockGoogleDrive();
          this.display();
        }));
    }

    containerEl.createEl("h3", { text: "Other providers" });
    for (const label of ["Microsoft OneDrive", "MEGA"]) {
      new Setting(containerEl).setName(label).setDesc("Integration not enabled in this batch.");
    }
  }
}
