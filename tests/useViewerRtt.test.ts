import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useViewerRtt } from '../src/composables/useViewerRtt'
import { mergeGraph } from '../src/utils/mergeGraph'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { VIEWER_ID } from '../src/utils/rttStats'
import { graph, node } from './graphs'

const merged = (...urls: string[]): MergedGraph => mergeGraph(graph(urls.map((u) => node(u, u.includes('dead') ? 'unreachable' : 'visited')), []))

function make(initial: MergedGraph | null, fetchFn: typeof fetch) {
  const source = ref<MergedGraph | null>(initial)
  const scope = effectScope()
  const api = scope.run(() => useViewerRtt(source, { fetchFn, intervalMs: 1000, timeoutMs: 100 }))!
  return { source, api, scope }
}

const answering = (dead = 'dead') =>
  vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes(dead)) throw new TypeError('Failed to fetch')
    await new Promise((r) => setTimeout(r, 12))
    return new Response(null, { status: 200 })
  }) as unknown as typeof fetch

describe('useViewerRtt', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('measures nothing until switched on', async () => {
    const f = answering()
    const { api } = make(merged('http://a'), f)
    await vi.advanceTimersByTimeAsync(5000)
    expect(f).not.toHaveBeenCalled()
    expect(api.running.value).toBe(false)
    expect(api.links.value).toEqual([])
  })

  it('measures every known node, including unreachable ones, and links only those that answered', async () => {
    const f = answering()
    const { api } = make(merged('http://a', 'http://b', 'http://dead'), f)
    api.toggle()
    expect(api.running.value).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toContain('http://dead/nodes/status')
    expect(api.summaries.value.map((s) => [s.url, s.count, s.lossRatio])).toEqual([['http://a', 1, 0], ['http://b', 1, 0], ['http://dead', 0, 1]])
    expect(api.links.value.map((l) => [l.a, l.b])).toEqual([[VIEWER_ID, 'http://a'], [VIEWER_ID, 'http://b']])
    expect(api.drawLinks.value).toEqual([{ a: VIEWER_ID, b: 'http://a' }, { a: VIEWER_ID, b: 'http://b' }])
    expect(api.ranking.value.fastest).not.toBeNull()
    api.toggle()
  })

  it('accumulates samples across rounds and stops when switched off', async () => {
    const f = answering()
    const { api } = make(merged('http://a'), f)
    api.toggle()
    await vi.advanceTimersByTimeAsync(2500)
    expect(api.summaries.value[0].count).toBe(3)
    api.toggle()
    expect(api.running.value).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.summaries.value[0].count).toBe(3)
  })

  it('follows the graph: a node that leaves is dropped and one that joins is measured', async () => {
    const f = answering()
    const { source, api } = make(merged('http://a', 'http://b'), f)
    api.toggle()
    await vi.advanceTimersByTimeAsync(100)
    source.value = merged('http://b', 'http://c')
    await nextTick()
    expect(api.summaries.value.map((s) => s.url)).toEqual(['http://b', 'http://c'])
    await vi.advanceTimersByTimeAsync(1100)
    expect(api.summaries.value.map((s) => [s.url, s.count])).toEqual([['http://b', 2], ['http://c', 1]])
    api.toggle()
  })

  it('has no summaries and makes no requests without a graph', async () => {
    const f = answering()
    const { api } = make(null, f)
    api.toggle()
    await vi.advanceTimersByTimeAsync(2000)
    expect(f).not.toHaveBeenCalled()
    expect(api.summaries.value).toEqual([])
    api.toggle()
  })

  it('stops measuring when its scope is disposed', async () => {
    const f = answering()
    const { api, scope } = make(merged('http://a'), f)
    api.toggle()
    await vi.advanceTimersByTimeAsync(100)
    scope.stop()
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })
})
