import type { VaultChange } from "./types";

export class ChangeQueue {
  private changes = new Map<string, VaultChange>();

  enqueue(change: VaultChange): void {
    const existing = this.changes.get(change.path);
    if (existing?.kind === "create" && change.kind === "delete") {
      this.changes.delete(change.path);
      return;
    }
    this.changes.set(change.path, change);
  }

  remove(id: string): void {
    for (const [path, change] of this.changes) {
      if (change.id === id) this.changes.delete(path);
    }
  }

  list(): VaultChange[] {
    return [...this.changes.values()].sort((a, b) => a.queuedAt - b.queuedAt);
  }

  restore(changes: VaultChange[]): void {
    this.changes.clear();
    for (const change of changes) this.changes.set(change.path, change);
  }

  get size(): number {
    return this.changes.size;
  }
}
