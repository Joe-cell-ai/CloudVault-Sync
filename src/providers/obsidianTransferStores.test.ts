import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ObsidianPendingPayloadStore, PluginDataUploadStateStore, type BinaryStorageAdapter } from "./obsidianTransferStores";

describe("transfer persistence adapters", () => {
  it("persists ciphertext bytes and removes them after completion", async () => {
    const files = new Map<string, ArrayBuffer>();
    const adapter: BinaryStorageAdapter = {
      exists: async path => files.has(path) || path === ".cloudvault-sync",
      mkdir: async () => undefined,
      readBinary: async path => files.get(path)!,
      writeBinary: async (path, data) => { files.set(path, data); },
      remove: async path => { files.delete(path); },
    };
    const store = new ObsidianPendingPayloadStore(adapter);
    const ref = await store.put("notes/hello.md", new Uint8Array([4, 5, 6]));
    const restored = await store.get(ref);
    assert.ok(restored);
    assert.deepEqual([...restored], [4, 5, 6]);
    await store.remove(ref);
    assert.equal(await store.get(ref), undefined);
  });

  it("persists upload offsets and removes completed sessions", async () => {
    let persisted: { path: string; offset: number; totalBytes: number; fileName: string; folderId: string; mimeType: string; payloadReference: string; createdAt: number }[] = [];
    const store = new PluginDataUploadStateStore([], async states => { persisted = states; });
    const state = {
      path: "notes/hello.md", fileName: "hello.md", folderId: "folder",
      mimeType: "text/markdown", payloadReference: ".cloudvault-sync/pending/x.bin",
      offset: 1024, totalBytes: 2048, createdAt: 1,
    };
    await store.set(state);
    assert.equal(persisted[0].offset, 1024);
    await store.remove(state.path);
    assert.equal(persisted.length, 0);
  });
});
