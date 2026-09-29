import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useLayout } from '../src/composables/useLayout'
import { VIEWER_ID } from '../src/utils/rttStats'
import type { LayoutLink } from '../src/utils/layout'
import { mergeGraph } from '../src/utils/mergeGraph'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { edge, graph, node } from './graphs'

const merged = (rtt: number, extra: string[] = []): MergedGraph =>
  mergeGraph(
    graph(
      [node('http://a'), node('http://b'), ...extra.map((u) => node(u))],
      [edge('http://a', 'http://b', 'active', rtt), edge('http://b', 'http://a', 'active', rtt), ...extra.map((u) => edge('http://a', u, 'active', rtt))],
    ),
  )

function make(initial: MergedGraph | null) {
  const source = ref<MergedGraph | null>(initial)
  const scope = effectScope()
  const api = scope.run(() => useLayout(source))!
  return { source, api }
}

const gap = (api: ReturnType<typeof useLayout>) => {
  const p = api.layout.value!.positions
  return Math.hypot(p['http://a'].x - p['http://b'].x, p['http://a'].y - p['http://b'].y)
}

describe('useLayout', () => {
  it('has no layout until there is a graph, and clears it when the graph goes away', async () => {
    const { source, api } = make(null)
    expect(api.layout.value).toBeNull()
    source.value = merged(10)
    await nextTick()
    expect(api.layout.value).not.toBeNull()
    source.value = null
    await nextTick()
    expect(api.layout.value).toBeNull()
  })

  it('lays out immediately when it starts with a graph', () => {
    const { api } = make(merged(10))
    expect(Object.keys(api.layout.value!.positions)).toHaveLength(2)
  })

  it('relayouts on refresh and keeps the scale steady', async () => {
    const { source, api } = make(merged(10))
    const scale = api.layout.value!.pxPerMs
    source.value = merged(12)
    await nextTick()
    expect(api.layout.value!.pxPerMs).toBe(scale)
    expect(gap(api)).toBeGreaterThan(12 * scale * 0.8)
  })

  it('keeps existing nodes near where they were when a node joins', async () => {
    const { source, api } = make(merged(10))
    const before = { ...api.layout.value!.positions }
    source.value = merged(10, ['http://c'])
    await nextTick()
    const after = api.layout.value!.positions
    expect(Math.hypot(after['http://a'].x - before['http://a'].x, after['http://a'].y - before['http://a'].y)).toBeLessThan(15)
  })

  it('pins a node where it is dropped, keeps the pin across refreshes, and releases it', async () => {
    const { source, api } = make(merged(10))
    api.pin('http://a', { x: 111, y: -222 })
    expect(api.layout.value!.positions['http://a']).toEqual({ x: 111, y: -222 })
    expect([...api.pinned.value]).toEqual(['http://a'])
    source.value = merged(11)
    await nextTick()
    expect(api.layout.value!.positions['http://a']).toEqual({ x: 111, y: -222 })
    api.unpin('http://a')
    expect(api.pinned.value.size).toBe(0)
    expect(api.layout.value!.positions['http://a']).not.toEqual({ x: 111, y: -222 })
  })

  it('exposes a scale bar in round milliseconds that fits the canvas view', () => {
    const { api } = make(merged(10))
    expect(api.bar.value.ms).toBeGreaterThan(0)
    expect([1, 2, 5]).toContain(Number(String(api.bar.value.ms)[0]))
    expect(api.bar.value.px).toBeLessThanOrEqual(120)
  })

  it('lays out independently of the canvas size; only the view follows it', () => {
    const size = ref({ width: 720, height: 480 })
    const scope = effectScope()
    const api = scope.run(() => useLayout(ref<MergedGraph | null>(merged(10, ['http://c'])), undefined, size))!
    const positions = { ...api.layout.value!.positions }
    const view = api.view.value
    size.value = { width: 1600, height: 900 }
    expect(api.layout.value!.positions).toEqual(positions)
    expect(api.view.value).not.toEqual(view)
    expect(api.view.value.tx).toBeGreaterThan(view.tx)
  })

  it('reports no scale bar when there is no graph', () => {
    expect(make(null).api.bar.value).toEqual({ px: 0, ms: 0 })
  })

  it('places the viewer by its measured links and relayouts when they change', async () => {
    const extra = ref<LayoutLink[]>([
      { a: VIEWER_ID, b: 'http://a', rttMs: 10 },
      { a: VIEWER_ID, b: 'http://b', rttMs: 10 },
    ])
    const scope = effectScope()
    const api = scope.run(() => useLayout(ref<MergedGraph | null>(merged(10)), extra))!
    const dist = (id: string) => {
      const p = api.layout.value!.positions
      return Math.hypot(p[VIEWER_ID].x - p[id].x, p[VIEWER_ID].y - p[id].y)
    }
    expect(Object.keys(api.layout.value!.positions)).toContain(VIEWER_ID)
    const near = dist('http://a')
    extra.value = [
      { a: VIEWER_ID, b: 'http://a', rttMs: 10 },
      { a: VIEWER_ID, b: 'http://b', rttMs: 200 },
    ]
    await nextTick()
    expect(dist('http://b')).toBeGreaterThan(dist('http://a') * 2)
    expect(near).toBeGreaterThan(0)
    extra.value = []
    await nextTick()
    expect(Object.keys(api.layout.value!.positions)).not.toContain(VIEWER_ID)
  })
})
