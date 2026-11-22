import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EncryptedSyncBaseline, hashFileContent } from "./encryptedSyncBaseline";

describe("EncryptedSyncBaseline", () => {
  it("stores encrypted baseline metadata and restores it", async () => {
    let stored: string | undefined;
    const baselines = new EncryptedSyncBaseline({
      read: async () => stored,
      write: async value => { stored = value; },
    });
    const entry = await baselines.record({
      path: "Notes/Today.md",
      localContent: new TextEncoder().encode("local contents"),
      remoteFileId: "drive-id",
      remoteRevision: "rev-7",
      remoteModifiedTime: "2026-11-22T00:00:00Z",
    }, "a-long-test-passphrase");
    assert.ok(stored);
    assert.equal(stored!.includes("Notes/Today.md"), false);
    assert.equal(stored!.includes("drive-id"), false);
    assert.deepEqual(await baselines.get("Notes/Today.md", "a-long-test-passphrase"), entry);
    assert.equal((await baselines.list("a-long-test-passphrase")).length, 1);
  });

  it("hashes content deterministically and detects content changes", async () => {
    const first = await hashFileContent(new TextEncoder().encode("same"));
    assert.equal(first, await hashFileContent(new TextEncoder().encode("same")));
    assert.notEqual(first, await hashFileContent(new TextEncoder().encode("changed")));
  });

  it("normalizes separators and rejects traversal paths", async () => {
    let stored: string | undefined;
    const baselines = new EncryptedSyncBaseline({ read: async () => stored, write: async value => { stored = value; } });
    await baselines.record({
      path: "folder\\note.md", localContent: new Uint8Array([1]),
      remoteFileId: "id", remoteRevision: "rev",
    }, "a-long-test-passphrase");
    assert.ok(await baselines.get("folder/note.md", "a-long-test-passphrase"));
    await assert.rejects(() => baselines.record({
      path: "../outside.md", localContent: new Uint8Array([1]),
      remoteFileId: "id", remoteRevision: "rev",
    }, "a-long-test-passphrase"), /safe vault-relative path/i);
  });

  it("rejects a wrong passphrase", async () => {
    let stored: string | undefined;
    const baselines = new EncryptedSyncBaseline({ read: async () => stored, write: async value => { stored = value; } });
    await baselines.record({
      path: "Private.md", localContent: new Uint8Array([9]),
      remoteFileId: "id", remoteRevision: "rev",
    }, "correct-long-passphrase");
    await assert.rejects(() => baselines.get("Private.md", "incorrect-long-passphrase"), /decrypt/i);
  });

  it("removes a baseline without deleting any remote data", async () => {
    let stored: string | undefined;
    const baselines = new EncryptedSyncBaseline({ read: async () => stored, write: async value => { stored = value; } });
    await baselines.record({
      path: "Notes/a.md", localContent: new Uint8Array([1]),
      remoteFileId: "id", remoteRevision: "rev",
    }, "a-long-test-passphrase");
    await baselines.remove("Notes/a.md", "a-long-test-passphrase");
    assert.equal(await baselines.get("Notes/a.md", "a-long-test-passphrase"), undefined);
  });
});
