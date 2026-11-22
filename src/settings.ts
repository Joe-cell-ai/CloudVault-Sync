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
  plugin: Plugin & { settings: CloudVaultSettings; saveSettings: () => Promise<void>; connectGoogleDrive: () => Promise<void> };

  constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: Plugin & {
    settings: CloudVaultSettings;
    saveSettings: () => Promise<void>;
    connectGoogleDrive: () => Promise<void>;
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

    containerEl.createEl("h3", { text: "Google Drive (preview)" });
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
      .setDesc("Must exactly match a redirect URI registered in your Google Cloud OAuth client.")
      .addText(text => text.setPlaceholder("https://your-auth-callback.example/")
        .setValue(this.plugin.settings.googleDriveRedirectUri)
        .onChange(async value => {
          this.plugin.settings.googleDriveRedirectUri = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Connect Google Drive")
      .setDesc("Starts OAuth authorization with PKCE. No upload or download is performed by this preview.")
      .addButton(button => button.setButtonText("Connect").onClick(async () => {
        await this.plugin.connectGoogleDrive();
      }));

    containerEl.createEl("h3", { text: "Other providers" });
    for (const label of ["Microsoft OneDrive", "MEGA"]) {
      new Setting(containerEl).setName(label).setDesc("Integration not enabled in this batch.");
    }
  }
}
