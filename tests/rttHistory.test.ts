import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useNodeHistory } from '../src/composables/useNodeHistory'
import { crawlRtts, HISTORY_LIMIT, historyRows, recordCrawl } from '../src/utils/rttHistory'
import type { MergedGraph } from '../src/utils/mergeGraph'
import type { RttBook } from '../src/utils/rttStats'
import { edge, merged, node, reporting } from './extraGraphs'

const A = 'http://a'
const B = 'http://b'
const C = 'http://c'
const pair = (ab: number, bc?: number) => merged([reporting(A), reporting(B), reporting(C)], [edge(A, B, 'active', ab), ...(bc === undefined ? [] : [edge(B, C, 'active', bc)])])

describe('crawlRtts', () => {
  it('averages the round trips measured on every link touching a node, and omits unmeasured nodes', () => {
    expect(crawlRtts(pair(10, 30))).toEqual({ [A]: 10, [B]: 20, [C]: 30 })
    expect(crawlRtts(pair(10))).toEqual({ [A]: 10, [B]: 10 })
    expect(crawlRtts(merged([reporting(A)]))).toEqual({})
  })
})

describe('recordCrawl', () => {
  it('appends one point per measured node per refresh, oldest first', () => {
    const h1 = recordCrawl({}, pair(10), 1000)
    const h2 = recordCrawl(h1, pair(12), 2000)
    expect(h2[A]).toEqual([{ at: 1000, ms: 10 }, { at: 2000, ms: 12 }])
    expect(h2[C]).toBeUndefined()
  })

  it('is bounded to the limit, dropping the oldest', () => {
    let h = {}
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = recordCrawl(h, pair(i + 1), i)
    const points = (h as Record<string, { ms: number }[]>)[A]
    expect(points).toHaveLength(HISTORY_LIMIT)
    expect(points[0].ms).toBe(6)
    expect(recordCrawl(recordCrawl({}, pair(1), 1, 2), pair(2), 2, 2)[A]).toHaveLength(2)
    expect(recordCrawl(recordCrawl({}, pair(1), 1, 2), pair(2), 2, 0)[A]).toHaveLength(1)
  })

  it('keeps history through a refresh that did not measure a node, and forgets nodes that left', () => {
    const h1 = recordCrawl({}, pair(10, 30), 1)
    const h2 = recordCrawl(h1, pair(10), 2)
    expect(h2[C]).toEqual([{ at: 1, ms: 30 }])
    const h3 = recordCrawl(h2, merged([reporting(A), node(B, 'unvisited')], [edge(A, B, 'active', 5)]), 3)
    expect(h3[C]).toBeUndefined()
  })
})

describe('historyRows', () => {
  it('says so when nothing was measured', () => {
    expect(historyRows()).toEqual([{ label: 'Network-measured', value: 'no measurement yet', mono: true }])
  })

  it('summarises and lists the crawl series, then the viewer series with losses', () => {
    const rows = historyRows([{ at: 1, ms: 12 }, { at: 2, ms: 8.5 }], [20, null, 30])
    const by = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(by['Network-measured (2 refreshes)']).toBe('min 8.5 ms, last 8.5 ms')
    expect(by['Network-measured history']).toBe('12 ms, 8.5 ms')
    expect(by['Viewer-observed (3 samples)']).toContain('33% loss')
    expect(by['Viewer-observed history']).toBe('20 ms, lost, 30 ms')
  })

  it('uses the singular for one sample', () => {
    expect(historyRows([{ at: 1, ms: 5 }], [7]).map((r) => r.label)).toContain('Network-measured (1 refresh)')
    expect(historyRows([], [7]).map((r) => r.label)).toContain('Viewer-observed (1 sample)')
  })
})

describe('useNodeHistory', () => {
  it('records each new merged graph and shows the viewer book beside it', async () => {
    const source = ref<MergedGraph | null>(pair(10))
    const book = ref<RttBook>({ [A]: [5, null] })
    let t = 0
    const h = effectScope().run(() => useNodeHistory(source, book, () => ++t))!
    source.value = pair(14)
    await nextTick()
    expect(h.crawl.value[A]).toEqual([{ at: 1, ms: 10 }, { at: 2, ms: 14 }])
    const labels = h.rowsFor(A).map((r) => r.label)
    expect(labels).toContain('Viewer-observed (2 samples)')
    expect(h.rowsFor(C)[0].value).toBe('no measurement yet')
  })

  it('clears when the graph goes away', async () => {
    const source = ref<MergedGraph | null>(pair(10))
    const h = effectScope().run(() => useNodeHistory(source))!
    source.value = null
    await nextTick()
    expect(h.crawl.value).toEqual({})
  })
})
