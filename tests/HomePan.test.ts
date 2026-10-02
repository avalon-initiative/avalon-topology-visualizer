import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, node } from './graphs'
import { reached } from './traces'
import { onScreen, toScreen } from '../src/utils/viewport'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology, traceRoute } = vi.hoisted(() => ({ walkTopology: vi.fn(), traceRoute: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  fetchTrustAnchors: vi.fn(async () => []),
  walkTopology,
  traceRoute,
}))

import Home from '../src/views/Home.vue'

async function walked() {
  const wrapper = mount(Home, { attachTo: document.body })
  const [seed, refresh] = wrapper.findAll('input[type="text"]')
  await seed.setValue('http://a')
  await refresh.setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}
type W = Awaited<ReturnType<typeof walked>>
const canvas = (w: W) => w.findComponent({ name: 'TopologyCanvas' })
const el = (w: W) => canvas(w).get('canvas')
const screenOf = (w: W, id: string) => toScreen(canvas(w).props('view'), canvas(w).props('positions')[id])
const fire = async (w: W, type: string, x: number, y: number) => {
  el(w).element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
  await flushPromises()
}
const drag = async (w: W, from: { x: number; y: number }, by: { x: number; y: number }) => {
  await fire(w, 'pointerdown', from.x, from.y)
  await fire(w, 'pointermove', from.x + by.x, from.y + by.y)
  await fire(w, 'pointerup', from.x + by.x, from.y + by.y)
}
const resetButton = (w: W) => w.findAll('button').find((b) => b.text() === 'Reset view')

describe('Home pan', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
    walkTopology.mockResolvedValue(graph([node('http://a'), node('http://b'), node('http://c')], [edge('http://a', 'http://b', 'active', 20), edge('http://b', 'http://c', 'active', 10)]))
    traceRoute.mockResolvedValue(reached())
  })
  afterEach(() => vi.restoreAllMocks())

  it('moves every node by exactly the drag distance and leaves the scale alone', async () => {
    const w = await walked()
    const before = { a: screenOf(w, 'http://a'), c: screenOf(w, 'http://c') }
    const scale = canvas(w).props('view').scale
    await drag(w, { x: 5, y: 5 }, { x: -30, y: 20 })
    for (const [k, id] of [['a', 'http://a'], ['c', 'http://c']] as const) {
      const now = screenOf(w, id)
      expect(now.x - before[k].x).toBeCloseTo(-30)
      expect(now.y - before[k].y).toBeCloseTo(20)
    }
    expect(canvas(w).props('view').scale).toBe(scale)
    w.unmount()
  })

  it('hit-tests against the panned view: the node is selectable at its new place, not its old one', async () => {
    const w = await walked()
    const old = screenOf(w, 'http://b')
    await drag(w, { x: 5, y: 5 }, { x: -60, y: 40 })
    const now = screenOf(w, 'http://b')
    await fire(w, 'pointerdown', old.x, old.y)
    await fire(w, 'pointerup', old.x, old.y)
    expect(canvas(w).props('selected')).toBeUndefined()
    await fire(w, 'pointerdown', now.x, now.y)
    await fire(w, 'pointerup', now.x, now.y)
    expect(canvas(w).props('selected')).toBe('http://b')
    w.unmount()
  })

  it('does not pan when a node is dragged, and pins it', async () => {
    const w = await walked()
    const b = screenOf(w, 'http://b')
    await drag(w, b, { x: 30, y: 30 })
    expect(canvas(w).props('pinned').has('http://b')).toBe(true)
    expect(resetButton(w)).toBeUndefined()
    w.unmount()
  })

  it('shows Reset view only while panned, and restores the fitted view', async () => {
    const w = await walked()
    const before = canvas(w).props('view')
    expect(resetButton(w)).toBeUndefined()
    await drag(w, { x: 5, y: 5 }, { x: 40, y: 10 })
    expect(resetButton(w)).toBeDefined()
    await resetButton(w)!.trigger('click')
    expect(resetButton(w)).toBeUndefined()
    expect(canvas(w).props('view')).toEqual(before)
    w.unmount()
  })

  it('resets on a double-click of empty space', async () => {
    const w = await walked()
    const before = canvas(w).props('view')
    await drag(w, { x: 5, y: 5 }, { x: 40, y: 10 })
    await fire(w, 'dblclick', 5, 5)
    expect(canvas(w).props('view')).toEqual(before)
    expect(resetButton(w)).toBeUndefined()
    w.unmount()
  })

  it('cannot pan the graph out of reach', async () => {
    const w = await walked()
    for (let i = 0; i < 5; i++) await drag(w, { x: 5, y: 5 }, { x: -2000, y: -2000 })
    const xs = ['http://a', 'http://b', 'http://c'].map((id) => screenOf(w, id))
    expect(xs.some((p) => p.x >= 47.9 && p.y >= 47.9)).toBe(true)
    w.unmount()
  })

  it('keeps the pan across a refresh of the walk', async () => {
    const w = await walked()
    await drag(w, { x: 5, y: 5 }, { x: 40, y: 10 })
    walkTopology.mockResolvedValue(graph([node('http://a'), node('http://b'), node('http://c')], [edge('http://a', 'http://b', 'active', 20), edge('http://b', 'http://c', 'active', 10)]))
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(resetButton(w)).toBeDefined()
    w.unmount()
  })

  it('hands the panned view to the canvas that draws the trace, its viewer marker and the pulses', async () => {
    const w = await walked()
    canvas(w).vm.$emit('select', 'http://c')
    await flushPromises()
    const before = canvas(w).props('view')
    await drag(w, { x: 5, y: 5 }, { x: -25, y: 15 })
    const trace = w.get('[data-testid="trace-panel"]')
    await trace.findAll('button').find((b) => b.text() === 'Trace')!.trigger('click')
    await flushPromises()
    // The canvas draws the trace, its viewer marker and the pulses with the one `view` prop it hit-tests with.
    const props = canvas(w).props()
    expect(props.trace?.viewer?.label).toBe('This browser')
    expect(props.trace?.path).toEqual(['viewer:this-browser', 'http://a', 'http://b', 'http://c'])
    expect(props.view.tx - before.tx).toBeCloseTo(-25)
    expect(props.view.ty - before.ty).toBeCloseTo(15)
    w.unmount()
  })

  it('places the temporary viewer marker on the stage as panned, wherever the graph was dragged', async () => {
    for (const by of [{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -100 }, { x: 0, y: 100 }]) {
      const w = await walked()
      await drag(w, { x: 5, y: 5 }, by)
      canvas(w).vm.$emit('select', 'http://c')
      await flushPromises()
      const trace = w.get('[data-testid="trace-panel"]')
      await trace.findAll('button').find((b) => b.text() === 'Trace')!.trigger('click')
      await flushPromises()
      const at = canvas(w).props('trace')!.viewer!.at
      expect(onScreen(canvas(w).props('view'), at, { width: 720, height: 480 })).toBe(true)
      w.unmount()
    }
  })
})
