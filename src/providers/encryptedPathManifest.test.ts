import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EncryptedPathManifest, hashVaultPath } from "./encryptedPathManifest";

describe("EncryptedPathManifest", () => {
  it("stores paths encrypted and resolves them by the same opaque hash", async () => {
    let stored: string | undefined;
    const manifest = new EncryptedPathManifest({
      read: async () => stored,
      write: async value => { stored = value; },
    });
    const entry = await manifest.record("Projects/Plan.md", "a-long-test-passphrase", {
      fileId: "drive-file-id",
      modifiedTime: "2026-11-22T00:00:00Z",
    });
    assert.ok(stored);
    assert.equal(stored!.includes("Projects/Plan.md"), false);
    assert.equal(entry.pathHash, await hashVaultPath("Projects/Plan.md"));
    assert.deepEqual(await manifest.resolve(entry.pathHash, "a-long-test-passphrase"), entry);
    assert.equal((await manifest.list("a-long-test-passphrase")).length, 1);
  });

  it("normalizes path separators and Unicode before hashing", async () => {
    assert.equal(await hashVaultPath("folder\\note.md"), await hashVaultPath("folder/note.md"));
    assert.equal(await hashVaultPath("cafe\u0301.md"), await hashVaultPath("café.md"));
  });

  it("rejects a wrong passphrase without returning plaintext paths", async () => {
    let stored: string | undefined;
    const manifest = new EncryptedPathManifest({
      read: async () => stored,
      write: async value => { stored = value; },
    });
    const entry = await manifest.record("Private/Journal.md", "correct-long-passphrase");
    await assert.rejects(() => manifest.resolve(entry.pathHash, "incorrect-long-passphrase"), /decrypt/i);
  });

  it("returns no mapping for an unknown hash", async () => {
    const manifest = new EncryptedPathManifest({ read: async () => undefined, write: async () => undefined });
    assert.equal(await manifest.resolve("cloudvault-unknown", "a-long-test-passphrase"), undefined);
  });
});
