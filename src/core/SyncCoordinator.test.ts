import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SyncCoordinator } from "./SyncCoordinator";
import type { SyncProvider, SyncStateStore } from "./SyncCoordinator";
import type { SyncConflict } from "./ConflictDetector";

describe("SyncCoordinator", () => {
  it("advances the remote cursor only after a page is fully processed", async () => {
    let cursor: string | undefined;
    let downloaded = 0;
    const provider: SyncProvider = {
      listChanges: async () => ({ files: [], nextCursor: "delta-2" }),
      upload: async () => { throw new Error("unused"); },
      download: async () => { downloaded++; return new Uint8Array(); },
    };
    const state: SyncStateStore = {
      readCursor: async () => cursor,
      writeCursor: async (_id, value) => { cursor = value; },
      readConflicts: async () => [],
      writeConflicts: async () => {},
    };
    const coordinator = new SyncCoordinator({
      providerId: "test", provider, state,
      baselines: { get: async () => undefined, record: async () => { throw new Error("unused"); } } as never,
      local: async () => ({ path: "", exists: false, read: async () => new Uint8Array(), write: async () => {} }),
      pathForRemote: async () => undefined,
      passphrase: () => "long-test-passphrase",
      resolver: { resolve: async (_conflict: SyncConflict) => "defer" },
    });
    await coordinator.syncOnce();
    assert.equal(cursor, "delta-2");
    assert.equal(downloaded, 0);
  });

  it("does not advance the cursor when the remote page fails", async () => {
    let cursor: string | undefined;
    const provider: SyncProvider = {
      listChanges: async () => { throw new Error("network down"); },
      upload: async () => { throw new Error("unused"); },
      download: async () => new Uint8Array(),
    };
    const state: SyncStateStore = {
      readCursor: async () => cursor,
      writeCursor: async (_id, value) => { cursor = value; },
      readConflicts: async () => [],
      writeConflicts: async () => {},
    };
    const coordinator = new SyncCoordinator({
      providerId: "test", provider, state,
      baselines: { get: async () => undefined, record: async () => { throw new Error("unused"); } } as never,
      local: async () => ({ path: "", exists: false, read: async () => new Uint8Array(), write: async () => {} }),
      pathForRemote: async () => undefined,
      passphrase: () => "long-test-passphrase",
      resolver: { resolve: async () => "defer" },
    });
    await assert.rejects(() => coordinator.syncOnce(), /network down/);
    assert.equal(cursor, undefined);
  });
});
