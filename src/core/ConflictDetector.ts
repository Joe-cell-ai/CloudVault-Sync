export interface SyncBaseline {
  path: string;
  localModifiedAt: number;
  remoteModifiedAt: string;
  localRevision: string;
  remoteRevision: string;
}

export interface SyncObservation {
  path: string;
  localExists: boolean;
  localModifiedAt?: number;
  localRevision?: string;
  remoteExists: boolean;
  remoteModifiedAt?: string;
  remoteRevision?: string;
}

export interface SyncConflict {
  id: string;
  path: string;
  reason: "both-sides-changed" | "local-changed-remote-deleted" | "remote-changed-local-deleted";
  detectedAt: number;
  baseline?: SyncBaseline;
  observation: SyncObservation;
}

export type ReconciliationDecision =
  | { action: "no-change" }
  | { action: "upload-local" }
  | { action: "download-remote" }
  | { action: "conflict"; conflict: SyncConflict }
  | { action: "remote-deleted" }
  | { action: "local-deleted" };

/**
 * Pure decision logic. It never writes or deletes files; callers must resolve
 * conflicts explicitly before applying any transfer or deletion.
 */
export function detectConflict(
  baseline: SyncBaseline | undefined,
  current: SyncObservation,
): ReconciliationDecision {
  if (!baseline) {
    if (current.localExists && current.remoteExists) {
      return {
        action: "conflict",
        conflict: makeConflict("both-sides-changed", current),
      };
    }
    if (current.localExists) return { action: "upload-local" };
    if (current.remoteExists) return { action: "download-remote" };
    return { action: "no-change" };
  }

  const localChanged = current.localExists
    ? !baseline.localExists || current.localRevision !== baseline.localRevision
    : true;
  const remoteChanged = current.remoteExists
    ? !baseline.remoteExists || current.remoteRevision !== baseline.remoteRevision
    : true;

  if (localChanged && remoteChanged) {
    return { action: "conflict", conflict: makeConflict("both-sides-changed", current, baseline) };
  }
  if (localChanged && !current.remoteExists && current.localExists) {
    return { action: "conflict", conflict: makeConflict("local-changed-remote-deleted", current, baseline) };
  }
  if (remoteChanged && !current.localExists && current.remoteExists) {
    return { action: "conflict", conflict: makeConflict("remote-changed-local-deleted", current, baseline) };
  }
  if (!current.localExists && !current.remoteExists) return { action: "no-change" };
  if (!current.localExists) return { action: "local-deleted" };
  if (!current.remoteExists) return { action: "remote-deleted" };
  if (localChanged) return { action: "upload-local" };
  if (remoteChanged) return { action: "download-remote" };
  return { action: "no-change" };
}

function makeConflict(
  reason: SyncConflict["reason"],
  observation: SyncObservation,
  baseline?: SyncBaseline,
): SyncConflict {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    path: observation.path,
    reason,
    detectedAt: Date.now(),
    baseline,
    observation,
  };
}
