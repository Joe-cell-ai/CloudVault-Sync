import { Modal, Setting, type App } from "obsidian";
import type { SyncConflict } from "./ConflictDetector";

export type ConflictChoice = "keep-local" | "keep-remote" | "defer";

/** Explicit, non-destructive conflict decision UI. Defer never mutates either copy. */
export class ConflictResolutionModal extends Modal {
  private settled = false;
  constructor(app: App, private readonly conflict: SyncConflict, private readonly complete: (choice: ConflictChoice) => void) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText("CloudVault sync conflict");
    this.contentEl.createEl("p", { text: this.conflict.path });
    const descriptions: Record<SyncConflict["reason"], string> = {
      "both-sides-changed": "This file changed both locally and in cloud storage after the last successful sync.",
      "local-changed-remote-deleted": "The local file changed, but its cloud copy was deleted.",
      "remote-changed-local-deleted": "The cloud file changed, but its local copy was deleted.",
    };
    this.contentEl.createEl("p", { text: descriptions[this.conflict.reason] });
    this.contentEl.createEl("p", { text: "Choose which version to keep. The other version will not be silently overwritten." });
    new Setting(this.contentEl).setName("Keep local version").addButton(button => button.setButtonText("Keep local").setCta().onClick(() => this.finish("keep-local")));
    new Setting(this.contentEl).setName("Keep cloud version").addButton(button => button.setButtonText("Keep cloud").onClick(() => this.finish("keep-remote")));
    new Setting(this.contentEl).setName("Decide later").addButton(button => button.setButtonText("Defer").onClick(() => this.finish("defer")));
  }
  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.finish("defer");
  }
  private finish(choice: ConflictChoice): void {
    if (this.settled) return;
    this.settled = true;
    this.complete(choice);
    this.close();
  }
}
