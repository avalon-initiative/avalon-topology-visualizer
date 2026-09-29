import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, shallowRef } from 'vue'
import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'
import { useTimelapse } from '../src/composables/useTimelapse'
import { HISTORY_STORAGE_KEY, serializeHistory } from '../src/utils/history'
import { createSnapshot } from '../src/utils/snapshot'
import { mergeGraph } from '../src/utils/mergeGraph'
import { graph, visited } from './graphs'

vi.mock('../src/utils/snapshotFile', () => ({ downloadText: vi.fn(), readFileText: vi.fn() }))
import { downloadText, readFileText } from '../src/utils/snapshotFile'

const at = (...urls: string[]) => graph(urls.map((u) => visited(u)), [])

function fakeCrawler() {
  const g = shallowRef<TopologyGraph | null>(null)
  const takenAt = ref<Date | null>(null)
  const isLive = ref(true)
  const merged = computed(() => (g.value ? mergeGraph(g.value) : null))
  return {
    crawler: { graph: g, takenAt, isLive, merged },
    refresh: async (next: TopologyGraph, when = new Date()) => {
      takenAt.value = when
      g.value = next
      await nextTick()
    },
  }
}

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

function make(options: Parameters<typeof useTimelapse>[1] = { storage: memoryStorage() }) {
  const fake = fakeCrawler()
  const scope = effectScope()
  const t = scope.run(() => useTimelapse(fake.crawler, options))!
  return { ...fake, t, scope }
}

describe('useTimelapse recording', () => {
  it('records one snapshot per refresh, oldest first', async () => {
    const { t, refresh } = make()
    await refresh(at('http://a'), new Date(1000))
    await refresh(at('http://a', 'http://b'), new Date(2000))
    expect(t.history.value.map((s) => s.takenAt)).toEqual([new Date(1000).toISOString(), new Date(2000).toISOString()])
    expect(t.history.value[1].graph.nodes).toHaveLength(2)
  })

  it('never exceeds the cap and drops the oldest', async () => {
    const { t, refresh } = make({ storage: null, cap: 3 })
    for (let i = 1; i <= 5; i++) await refresh(at(`http://n${i}`), new Date(i * 1000))
    expect(t.history.value).toHaveLength(3)
    expect(t.history.value[0].takenAt).toBe(new Date(3000).toISOString())
  })

  it('does not record snapshots that were loaded from a file, cancelled walks, or an empty result', async () => {
    const { t, refresh, crawler } = make()
    crawler.isLive.value = false
    await refresh(at('http://a'))
    crawler.isLive.value = true
    await refresh({ ...at('http://b'), cancelled: true })
    crawler.graph.value = null
    await nextTick()
    expect(t.history.value).toEqual([])
  })

  it('shows the live crawl by default', async () => {
    const { t, refresh } = make()
    await refresh(at('http://a'))
    expect(t.replaying.value).toBe(false)
    expect(t.shown.value?.nodes.map((n) => n.url)).toEqual(['http://a'])
  })
})

describe('useTimelapse replay', () => {
  async function three() {
    const m = make()
    await m.refresh(at('http://a'), new Date(1000))
    await m.refresh(at('http://a', 'http://b'), new Date(2000))
    await m.refresh(at('http://b'), new Date(3000))
    return m
  }

  it('seeks to a snapshot and shows that graph', async () => {
    const { t } = await three()
    t.seek(0)
    expect(t.replaying.value).toBe(true)
    expect(t.shown.value?.nodes.map((n) => n.url)).toEqual(['http://a'])
    t.seek(1)
    expect(t.shown.value?.nodes.map((n) => n.url)).toEqual(['http://a', 'http://b'])
  })

  it('clamps seeks to the recorded range', async () => {
    const { t } = await three()
    t.seek(99)
    expect(t.index.value).toBe(2)
    t.seek(-5)
    expect(t.index.value).toBe(0)
  })

  it('does nothing when there is nothing to replay', () => {
    const { t } = make()
    t.seek(0)
    t.step(1)
    t.play()
    expect(t.replaying.value).toBe(false)
    expect(t.playing.value).toBe(false)
  })

  it('steps forward and back within bounds, starting from the newest', async () => {
    const { t } = await three()
    t.step(-1)
    expect(t.index.value).toBe(1)
    t.step(-1)
    t.step(-1)
    expect(t.index.value).toBe(0)
    t.step(1)
    t.step(1)
    t.step(1)
    expect(t.index.value).toBe(2)
  })

  it('marks joins, departures and version changes per snapshot', async () => {
    const m = make()
    await m.refresh(graph([visited('http://a', { version: '0.1.0' })], []))
    await m.refresh(graph([visited('http://a', { version: '0.2.0' }), visited('http://b')], []))
    await m.refresh(graph([visited('http://b')], []))
    expect(m.t.markers.value.map((x) => x.label)).toEqual(['', '+1 ~1', '-1'])
    expect(m.t.changeCount.value).toBe(2)
    m.t.seek(1)
    expect(m.t.currentDiff.value.joined).toEqual(['http://b'])
    m.t.goLive()
    expect(m.t.currentDiff.value.joined).toEqual([])
  })

  it('keeps recording and leaves the replayed view alone while live refreshes arrive', async () => {
    const { t, refresh } = await three()
    t.seek(0)
    await refresh(at('http://x'), new Date(4000))
    expect(t.history.value).toHaveLength(4)
    expect(t.index.value).toBe(0)
    expect(t.shown.value?.nodes.map((n) => n.url)).toEqual(['http://a'])
    t.goLive()
    expect(t.replaying.value).toBe(false)
    expect(t.shown.value?.nodes.map((n) => n.url)).toEqual(['http://x'])
  })

  it('keeps pointing at the same snapshot when the cap drops older ones', async () => {
    const { t, refresh } = make({ storage: null, cap: 3 })
    for (let i = 1; i <= 3; i++) await refresh(at(`http://n${i}`), new Date(i * 1000))
    t.seek(2)
    await refresh(at('http://n4'), new Date(4000))
    expect(t.index.value).toBe(1)
    expect(t.shown.value?.nodes[0].url).toBe('http://n3')
    t.seek(0)
    await refresh(at('http://n5'), new Date(5000))
    expect(t.index.value).toBe(0)
  })

  describe('play', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('advances in order, then stops on the newest snapshot', async () => {
      const { t } = await three()
      t.play()
      expect(t.playing.value).toBe(true)
      expect(t.index.value).toBe(0)
      vi.advanceTimersByTime(1200)
      expect(t.index.value).toBe(1)
      vi.advanceTimersByTime(1200)
      expect(t.index.value).toBe(2)
      vi.advanceTimersByTime(1200)
      expect(t.playing.value).toBe(false)
      expect(t.index.value).toBe(2)
    })

    it('pauses, and going live stops it', async () => {
      const { t } = await three()
      t.play()
      t.pause()
      vi.advanceTimersByTime(5000)
      expect(t.index.value).toBe(0)
      t.play()
      t.goLive()
      expect(t.playing.value).toBe(false)
      expect(t.index.value).toBeNull()
    })

    it('needs at least two snapshots and stops when its scope ends', async () => {
      const one = make()
      await one.refresh(at('http://a'))
      one.t.play()
      expect(one.t.playing.value).toBe(false)
      const { t, scope } = await three()
      t.play()
      scope.stop()
      vi.advanceTimersByTime(5000)
      expect(t.index.value).toBe(0)
    })
  })
})

describe('useTimelapse storage', () => {
  it('persists each snapshot and loads them next time', async () => {
    const storage = memoryStorage()
    const first = make({ storage })
    await first.refresh(at('http://a'), new Date(1000))
    await first.refresh(at('http://b'), new Date(2000))
    expect(storage.getItem(HISTORY_STORAGE_KEY)).not.toBeNull()
    expect(first.t.saved.value).toBe(true)
    const again = make({ storage })
    expect(again.t.history.value).toHaveLength(2)
    expect(again.t.replaying.value).toBe(false)
  })

  it('works fully in memory when storage is unavailable, and says so', async () => {
    const { t, refresh } = make({ storage: null })
    expect(t.saved.value).toBe(false)
    await refresh(at('http://a'))
    await refresh(at('http://b'))
    t.seek(0)
    expect(t.shown.value?.nodes[0].url).toBe('http://a')
  })

  it('keeps working when storage throws on write', async () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('quota')
    }
    const { t, refresh } = make({ storage })
    await refresh(at('http://a'))
    expect(t.history.value).toHaveLength(1)
    expect(t.saved.value).toBe(false)
  })

  it('starts empty from corrupt stored data', () => {
    const storage = memoryStorage()
    storage.setItem(HISTORY_STORAGE_KEY, 'garbage')
    expect(make({ storage }).t.history.value).toEqual([])
  })

  it('clear empties memory and storage and returns to live', async () => {
    const storage = memoryStorage()
    const { t, refresh } = make({ storage })
    await refresh(at('http://a'))
    t.seek(0)
    t.clear()
    await nextTick()
    expect(t.history.value).toEqual([])
    expect(t.replaying.value).toBe(false)
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull()
  })
})

describe('useTimelapse export and import', () => {
  it('exports the history through a file download', async () => {
    const { t, refresh } = make()
    t.exportHistory()
    expect(downloadText).not.toHaveBeenCalled()
    await refresh(at('http://a'))
    t.exportHistory()
    const [name, text] = vi.mocked(downloadText).mock.calls[0]
    expect(name).toMatch(/^topology-history-.*\.json$/)
    expect(JSON.parse(text).snapshots).toHaveLength(1)
  })

  it('imports a history, starts replay at the first snapshot and clears any error', () => {
    const { t } = make()
    t.importText('nope')
    expect(t.error.value).toMatch(/Not a topology history/)
    t.importText(serializeHistory([createSnapshot(at('http://a'), new Date(1000)), createSnapshot(at('http://b'), new Date(2000))]))
    expect(t.error.value).toBe('')
    expect(t.history.value).toHaveLength(2)
    expect(t.index.value).toBe(0)
    expect(t.shown.value?.nodes[0].url).toBe('http://a')
  })

  it('a bad import leaves the existing history alone', async () => {
    const { t, refresh } = make()
    await refresh(at('http://a'))
    t.importText('{"format":"avalon-topology-history","version":1,"snapshots":[{}]}')
    expect(t.error.value).not.toBe('')
    expect(t.history.value).toHaveLength(1)
  })

  it('reads a chosen file and resets the input so the same file can be picked again', async () => {
    const { t } = make()
    vi.mocked(readFileText).mockResolvedValue(serializeHistory([createSnapshot(at('http://a'))]))
    const input = { files: [new File([''], 'h.json')], value: 'h.json' }
    await t.onImportFile({ target: input } as unknown as Event)
    expect(t.history.value).toHaveLength(1)
    expect(input.value).toBe('')
    await t.onImportFile({ target: { files: [], value: 'x' } } as unknown as Event)
    expect(t.history.value).toHaveLength(1)
  })
})
