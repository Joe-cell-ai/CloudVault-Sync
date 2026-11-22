import { Notice, Plugin } from "obsidian";
import { ChangeQueue } from "./core/ChangeQueue";
import type { VaultChange } from "./core/types";
import { CloudVaultSettingTab, DEFAULT_SETTINGS, type CloudVaultSettings } from "./settings";

interface PersistedData {
  settings?: Partial<CloudVaultSettings>;
  queue?: VaultChange[];
}

export default class CloudVaultSyncPlugin extends Plugin {
  settings: CloudVaultSettings = DEFAULT_SETTINGS;
  private queue = new ChangeQueue();
  private saveTimer: number | undefined;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    this.settings = this.mergeSettings(data?.settings);
    this.queue.restore(data?.queue ?? []);

    this.addSettingTab(new CloudVaultSettingTab(this.app, this as this & {
      settings: CloudVaultSettings;
      saveSettings: () => Promise<void>;
    }));

    if (this.settings.showRibbonIcon) {
      this.addRibbonIcon("cloud", "CloudVault Sync status", () => this.showStatus());
    }

    this.registerEvent(this.app.vault.on("create", file => this.record("create", file.path)));
    this.registerEvent(this.app.vault.on("modify", file => this.record("modify", file.path)));
    this.registerEvent(this.app.vault.on("delete", file => this.record("delete", file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.record("rename", file.path, oldPath);
    }));

    this.addCommand({
      id: "show-sync-status",
      name: "Show sync status",
      callback: () => this.showStatus(),
    });
    this.addCommand({
      id: "save-local-queue",
      name: "Save local change queue",
      callback: async () => {
        await this.persist();
        new Notice("CloudVault Sync: local queue saved.");
      },
    });
  }

  onunload(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    void this.persist();
  }

  async saveSettings(): Promise<void> {
    await this.persist();
  }

  private mergeSettings(partial?: Partial<CloudVaultSettings>): CloudVaultSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...partial,
      providers: { ...DEFAULT_SETTINGS.providers, ...partial?.providers },
    };
  }

  private record(kind: VaultChange["kind"], path: string, previousPath?: string): void {
    if (!this.settings.enableChangeTracking) return;
    this.queue.enqueue({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind,
      path,
      previousPath,
      queuedAt: Date.now(),
    });
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      void this.persist();
    }, 500);
  }

  private async persist(): Promise<void> {
    await this.saveData({ settings: this.settings, queue: this.queue.list() });
  }

  private showStatus(): void {
    new Notice(`CloudVault Sync · ${this.queue.size} local change(s) queued. Cloud upload is not enabled in this build.`, 6000);
  }
}
