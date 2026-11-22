import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectConflict, type SyncBaseline, type SyncObservation } from "./ConflictDetector";

const baseline: SyncBaseline = {
  path: "notes/today.md",
  localModifiedAt: 100,
  remoteModifiedAt: "2026-01-01T00:00:00.000Z",
  localRevision: "local-v1",
  remoteRevision: "remote-v1",
};

describe("detectConflict", () => {
  it("uploads a local-only change", () => {
    const current: SyncObservation = {
      path: baseline.path, localExists: true, localRevision: "local-v2",
      remoteExists: true, remoteRevision: "remote-v1",
    };
    assert.equal(detectConflict(baseline, current).action, "upload-local");
  });

  it("downloads a remote-only change", () => {
    const current: SyncObservation = {
      path: baseline.path, localExists: true, localRevision: "local-v1",
      remoteExists: true, remoteRevision: "remote-v2",
    };
    assert.equal(detectConflict(baseline, current).action, "download-remote");
  });

  it("preserves a conflict when both sides changed", () => {
    const current: SyncObservation = {
      path: baseline.path, localExists: true, localRevision: "local-v2",
      remoteExists: true, remoteRevision: "remote-v2",
    };
    const decision = detectConflict(baseline, current);
    assert.equal(decision.action, "conflict");
    if (decision.action === "conflict") assert.equal(decision.conflict.reason, "both-sides-changed");
  });

  it("does not silently erase a local edit after remote deletion", () => {
    const current: SyncObservation = {
      path: baseline.path, localExists: true, localRevision: "local-v2",
      remoteExists: false,
    };
    const decision = detectConflict(baseline, current);
    assert.equal(decision.action, "conflict");
    if (decision.action === "conflict") assert.equal(decision.conflict.reason, "local-changed-remote-deleted");
  });

  it("does not silently discard a remote edit after local deletion", () => {
    const current: SyncObservation = {
      path: baseline.path, localExists: false,
      remoteExists: true, remoteRevision: "remote-v2",
    };
    const decision = detectConflict(baseline, current);
    assert.equal(decision.action, "conflict");
    if (decision.action === "conflict") assert.equal(decision.conflict.reason, "remote-changed-local-deleted");
  });
});
