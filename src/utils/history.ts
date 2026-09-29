import { checkSnapshot, SnapshotError } from './snapshot'
import type { Snapshot } from './snapshot'

export const HISTORY_FORMAT = 'avalon-topology-history'
export const HISTORY_VERSION = 1
export const HISTORY_CAP = 30
export const HISTORY_STORAGE_KEY = 'avalon-topology-history'

/** Appends a snapshot and drops the oldest ones beyond `cap`; also says how many were dropped. */
export function appendSnapshot(history: readonly Snapshot[], snapshot: Snapshot, cap = HISTORY_CAP): { history: Snapshot[]; dropped: number } {
  const all = [...history, snapshot]
  const keep = Math.max(1, Math.floor(cap))
  const dropped = Math.max(0, all.length - keep)
  return { history: all.slice(dropped), dropped }
}

/** A history file: a list of ordinary snapshots, so each entry is also a valid single snapshot. */
export function serializeHistory(history: readonly Snapshot[]): string {
  return JSON.stringify({ format: HISTORY_FORMAT, version: HISTORY_VERSION, snapshots: history }, null, 2)
}

function fail(message: string): never {
  throw new SnapshotError(`Not a topology history: ${message}`)
}

/** Reads a history file, or a single snapshot file as a history of one. Oldest first, trimmed to `cap`. */
export function parseHistory(text: string, cap = HISTORY_CAP): Snapshot[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('the file is not valid JSON')
  }
  const h = raw as { format?: unknown; version?: unknown; snapshots?: unknown } | null
  if (h === null || typeof h !== 'object') return fail('expected a JSON object')
  if (h.format !== HISTORY_FORMAT) return [checkSnapshot(raw)]
  if (h.version !== HISTORY_VERSION) return fail(`unsupported version ${String(h.version)}`)
  if (!Array.isArray(h.snapshots)) return fail('snapshots is missing')
  const snapshots = h.snapshots.map(checkSnapshot).sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt))
  return snapshots.slice(Math.max(0, snapshots.length - Math.max(1, Math.floor(cap))))
}

/** Browser storage, or null when it is missing or blocked (private window, disabled site data). */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Reads the saved history; anything missing, unreadable or corrupt gives an empty history. */
export function loadHistory(storage: Storage | null, cap = HISTORY_CAP): Snapshot[] {
  try {
    const text = storage?.getItem(HISTORY_STORAGE_KEY)
    return text ? parseHistory(text, cap) : []
  } catch {
    return []
  }
}

/**
 * Saves the history. When the browser refuses the whole thing (quota), keeps as many of the newest
 * snapshots as fit. True only when everything was saved.
 */
export function saveHistory(storage: Storage | null, history: readonly Snapshot[]): boolean {
  if (!storage) return false
  if (history.length === 0) {
    clearStoredHistory(storage)
    return true
  }
  for (let from = 0; from < history.length; from++) {
    try {
      storage.setItem(HISTORY_STORAGE_KEY, serializeHistory(history.slice(from)))
      return from === 0
    } catch {
      // Too big or blocked: retry without the oldest snapshot.
    }
  }
  return false
}

export function clearStoredHistory(storage: Storage | null): void {
  try {
    storage?.removeItem(HISTORY_STORAGE_KEY)
  } catch {
    // Nothing stored that could be cleared.
  }
}

/** Nearest valid position in a history of `length` snapshots (-1 when it is empty). */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1
  return Math.min(length - 1, Math.max(0, Math.round(Number.isFinite(index) ? index : 0)))
}

/** Where a replay position points after `dropped` oldest snapshots were removed (never below the first). */
export function shiftIndex(index: number, dropped: number): number {
  return Math.max(0, index - dropped)
}
