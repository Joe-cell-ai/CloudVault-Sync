import type { Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";

export interface CloudVaultSettings {
  enableChangeTracking: boolean;
  showRibbonIcon: boolean;
  providers: {
    mega: boolean;
    oneDrive: boolean;
    googleDrive: boolean;
  };
}

export const DEFAULT_SETTINGS: CloudVaultSettings = {
  enableChangeTracking: true,
  showRibbonIcon: true,
  providers: { mega: false, oneDrive: false, googleDrive: false },
};

export class CloudVaultSettingTab extends PluginSettingTab {
  plugin: Plugin & { settings: CloudVaultSettings; saveSettings: () => Promise<void> };

  constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: Plugin & { settings: CloudVaultSettings; saveSettings: () => Promise<void> }) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CloudVault Sync" });
    containerEl.createEl("p", { text: "Provider connections will be configured in later development batches. No vault data is uploaded in this foundation build." });

    new Setting(containerEl)
      .setName("Track local vault changes")
      .setDesc("Record file changes locally so they can be synchronized when a provider is configured.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableChangeTracking)
        .onChange(async value => {
          this.plugin.settings.enableChangeTracking = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showRibbonIcon)
        .onChange(async value => {
          this.plugin.settings.showRibbonIcon = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("h3", { text: "Cloud providers" });
    for (const [key, label] of [
      ["googleDrive", "Google Drive"],
      ["oneDrive", "Microsoft OneDrive"],
      ["mega", "MEGA"],
    ] as const) {
      new Setting(containerEl)
        .setName(label)
        .setDesc("Provider integration is not active yet.")
        .addToggle(toggle => toggle.setValue(this.plugin.settings.providers[key]).setDisabled(true));
    }
  }
}
