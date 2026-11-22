import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { restoreWithoutOverwrite, type SafeVaultWriter } from "./googleDriveTransfer";

describe("restoreWithoutOverwrite", () => {
  it("restores to the original path when it does not exist", async () => {
    const files = new Map<string, ArrayBuffer>();
    const vault: SafeVaultWriter = {
      exists: async path => files.has(path),
      createBinary: async (path, data) => { files.set(path, data); },
    };
    const result = await restoreWithoutOverwrite(vault, "notes/a.md", new Uint8Array([1, 2]));
    assert.deepEqual(result, { path: "notes/a.md", createdAsConflictCopy: false });
    assert.deepEqual([...new Uint8Array(files.get("notes/a.md")!)], [1, 2]);
  });

  it("creates a conflict copy instead of overwriting an existing file", async () => {
    const files = new Map<string, ArrayBuffer>([["notes/a.md", new Uint8Array([9]).buffer]]);
    const vault: SafeVaultWriter = {
      exists: async path => files.has(path),
      createBinary: async (path, data) => { files.set(path, data); },
    };
    const result = await restoreWithoutOverwrite(vault, "notes/a.md", new Uint8Array([1, 2]), new Date("2026-11-22T00:00:00Z"));
    assert.equal(result.createdAsConflictCopy, true);
    assert.match(result.path, /a\.cloudvault-conflict-/);
    assert.deepEqual([...new Uint8Array(files.get("notes/a.md")!)], [9]);
  });
});
