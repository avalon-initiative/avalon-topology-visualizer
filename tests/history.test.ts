import { describe, expect, it } from 'vitest'
import {
  appendSnapshot,
  browserStorage,
  clampIndex,
  HISTORY_CAP,
  HISTORY_STORAGE_KEY,
  loadHistory,
  parseHistory,
  saveHistory,
  serializeHistory,
  shiftIndex,
} from '../src/utils/history'
import { createSnapshot, serializeSnapshot, SnapshotError } from '../src/utils/snapshot'
import { edge, graph, node } from './graphs'

const snap = (n: number) => createSnapshot(graph([node(`http://n${n}`), node('http://b')], [edge(`http://n${n}`, 'http://b')]), new Date(Date.UTC(2026, 0, 1, 0, n)))

function memoryStorage(limit = Infinity): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => {
      if (v.length > limit) throw new DOMException('full', 'QuotaExceededError')
      data.set(k, v)
    },
  }
}

describe('appendSnapshot', () => {
  it('appends in order', () => {
    const r = appendSnapshot([snap(1)], snap(2), 5)
    expect(r.history.map((s) => s.takenAt)).toEqual([snap(1).takenAt, snap(2).takenAt])
    expect(r.dropped).toBe(0)
  })

  it('drops the oldest once the cap is exceeded', () => {
    let h = [snap(1), snap(2), snap(3)]
    const r = appendSnapshot(h, snap(4), 3)
    h = r.history
    expect(h).toHaveLength(3)
    expect(h[0].takenAt).toBe(snap(2).takenAt)
    expect(h[2].takenAt).toBe(snap(4).takenAt)
    expect(r.dropped).toBe(1)
  })

  it('never exceeds the cap however many are added, and keeps at least one', () => {
    let h: ReturnType<typeof snap>[] = []
    for (let i = 0; i < 100; i++) h = appendSnapshot(h, snap(i % 50), 7).history
    expect(h).toHaveLength(7)
    expect(appendSnapshot([snap(1)], snap(2), 0).history).toHaveLength(1)
  })

  it('does not modify its input and has a sensible default cap', () => {
    const h = [snap(1)]
    appendSnapshot(h, snap(2))
    expect(h).toHaveLength(1)
    expect(HISTORY_CAP).toBeGreaterThan(1)
  })
})

describe('export and import', () => {
  it('round-trips a history unchanged', () => {
    const h = [snap(1), snap(2), snap(3)]
    expect(parseHistory(serializeHistory(h))).toEqual(h)
  })

  it('uses the crawler snapshot format for every entry', () => {
    const file = JSON.parse(serializeHistory([snap(1)]))
    expect(file.snapshots[0]).toEqual(JSON.parse(serializeSnapshot(snap(1))))
  })

  it('reads a single crawler snapshot file as a history of one', () => {
    expect(parseHistory(serializeSnapshot(snap(1)))).toEqual([snap(1)])
  })

  it('orders imported snapshots by time and trims to the cap keeping the newest', () => {
    const text = serializeHistory([snap(3), snap(1), snap(2)])
    expect(parseHistory(text).map((s) => s.takenAt)).toEqual([snap(1).takenAt, snap(2).takenAt, snap(3).takenAt])
    expect(parseHistory(text, 2).map((s) => s.takenAt)).toEqual([snap(2).takenAt, snap(3).takenAt])
  })

  it('round-trips an empty history', () => {
    expect(parseHistory(serializeHistory([]))).toEqual([])
  })

  it.each([
    ['not json', 'nope'],
    ['a non-object', '3'],
    ['null', 'null'],
    ['an unknown format', '{"format":"other"}'],
    ['a wrong version', '{"format":"avalon-topology-history","version":9,"snapshots":[]}'],
    ['missing snapshots', '{"format":"avalon-topology-history","version":1}'],
    ['a malformed entry', '{"format":"avalon-topology-history","version":1,"snapshots":[{"format":"avalon-topology-snapshot"}]}'],
  ])('rejects %s with a SnapshotError', (_name, text) => {
    expect(() => parseHistory(text)).toThrow(SnapshotError)
  })
})

describe('browser storage', () => {
  it('saves and loads', () => {
    const s = memoryStorage()
    expect(saveHistory(s, [snap(1), snap(2)])).toBe(true)
    expect(loadHistory(s)).toEqual([snap(1), snap(2)])
  })

  it('saving an empty history removes the entry', () => {
    const s = memoryStorage()
    saveHistory(s, [snap(1)])
    expect(saveHistory(s, [])).toBe(true)
    expect(s.data.has(HISTORY_STORAGE_KEY)).toBe(false)
  })

  it('works without storage at all', () => {
    expect(saveHistory(null, [snap(1)])).toBe(false)
    expect(loadHistory(null)).toEqual([])
  })

  it('survives storage that throws on every access', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(loadHistory(broken)).toEqual([])
    expect(saveHistory(broken, [snap(1)])).toBe(false)
    expect(saveHistory(broken, [])).toBe(true)
  })

  it('treats corrupt stored data as empty', () => {
    const s = memoryStorage()
    s.setItem(HISTORY_STORAGE_KEY, '{oops')
    expect(loadHistory(s)).toEqual([])
  })

  it('keeps the newest snapshots that fit when storage is full, and says it was partial', () => {
    const one = serializeHistory([snap(3)]).length
    const s = memoryStorage(one + 50)
    expect(saveHistory(s, [snap(1), snap(2), snap(3)])).toBe(false)
    const kept = loadHistory(s)
    expect(kept.length).toBeGreaterThanOrEqual(1)
    expect(kept[kept.length - 1].takenAt).toBe(snap(3).takenAt)
    expect(kept.length).toBeLessThan(3)
  })

  it('reports failure when not even one snapshot fits', () => {
    expect(saveHistory(memoryStorage(10), [snap(1)])).toBe(false)
  })

  it('finds no storage when reading it throws', () => {
    const spy = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied')
      },
    })
    try {
      expect(browserStorage()).toBeNull()
    } finally {
      if (spy) Object.defineProperty(globalThis, 'localStorage', spy)
      else delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })
})

describe('replay position helpers', () => {
  it('clamps into bounds and reports empty', () => {
    expect(clampIndex(-3, 5)).toBe(0)
    expect(clampIndex(99, 5)).toBe(4)
    expect(clampIndex(2.6, 5)).toBe(3)
    expect(clampIndex(Number.NaN, 5)).toBe(0)
    expect(clampIndex(0, 0)).toBe(-1)
  })

  it('shifts with dropped snapshots but never below the first', () => {
    expect(shiftIndex(5, 2)).toBe(3)
    expect(shiftIndex(1, 3)).toBe(0)
    expect(shiftIndex(2, 0)).toBe(2)
  })
})
