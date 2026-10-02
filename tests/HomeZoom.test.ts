import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, node } from './graphs'
import { reached } from './traces'
import { onScreen, toScreen, toWorld } from '../src/utils/viewport'
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../src/utils/zoom'

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
const view = (w: W) => canvas(w).props('view')
const screenOf = (w: W, id: string) => toScreen(view(w), canvas(w).props('positions')[id])
const fire = async (w: W, type: string, x: number, y: number) => {
  el(w).element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
  await flushPromises()
}
const wheel = async (w: W, deltaY: number, x: number, y: number) => {
  el(w).element.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  await flushPromises()
}
const click = async (w: W, p: { x: number; y: number }) => {
  await fire(w, 'pointerdown', p.x, p.y)
  await fire(w, 'pointerup', p.x, p.y)
}
const button = (w: W, name: string) => w.find(`button[aria-label="${name}"]`)
const resetButton = (w: W) => w.findAll('button').find((b) => b.text() === 'Reset view')
const readout = (w: W) => w.findAll('[role="status"]').map((n) => n.text()).find((t) => t.startsWith('Zoom')) ?? ''
const bar = (w: W) => w.findComponent({ name: 'ScaleBar' }).props() as { px: number; ms: number }
const ids = ['http://a', 'http://b', 'http://c']

describe('Home zoom', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
    walkTopology.mockResolvedValue(graph([node('http://a'), node('http://b'), node('http://c')], [edge('http://a', 'http://b', 'active', 20), edge('http://b', 'http://c', 'active', 10)]))
    traceRoute.mockResolvedValue(reached())
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps the node under the cursor where it is while the wheel zooms, and changes the scale', async () => {
    const w = await walked()
    const before = screenOf(w, 'http://b')
    const scale = view(w).scale
    await wheel(w, -200, before.x, before.y)
    const after = screenOf(w, 'http://b')
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(view(w).scale).toBeCloseTo(scale * Math.exp(0.3), 9)
    expect(readout(w)).toBe(`Zoom ${Math.round(Math.exp(0.3) * 100)}%`)
    w.unmount()
  })

  it('selects a node at its zoomed position, not the old one, and the drawer names it', async () => {
    const w = await walked()
    const anchor = screenOf(w, 'http://a')
    await wheel(w, -400, anchor.x, anchor.y)
    const old = { x: 0, y: 0 }
    // b moved away from a as the scale grew; find where it was at zoom 1 by undoing the zoom.
    const now = screenOf(w, 'http://b')
    old.x = anchor.x + (now.x - anchor.x) / Math.exp(0.6)
    old.y = anchor.y + (now.y - anchor.y) / Math.exp(0.6)
    expect(Math.hypot(now.x - old.x, now.y - old.y)).toBeGreaterThan(30)
    await click(w, old)
    expect(canvas(w).props('selected')).toBeUndefined()
    await click(w, now)
    expect(canvas(w).props('selected')).toBe('http://b')
    w.unmount()
  })

  it('pins a dragged node at the world point under the pointer while zoomed', async () => {
    const w = await walked()
    const a = screenOf(w, 'http://a')
    await wheel(w, -300, a.x, a.y)
    const b = screenOf(w, 'http://b')
    const zoomed = view(w)
    await fire(w, 'pointerdown', b.x, b.y)
    await fire(w, 'pointermove', b.x + 20, b.y + 10)
    await fire(w, 'pointerup', b.x + 20, b.y + 10)
    expect(canvas(w).props('pinned').has('http://b')).toBe(true)
    // The pin lands on the world point that was under the pointer in the zoomed view (the re-fit afterwards may shift the screen).
    const world = canvas(w).props('positions')['http://b']
    const expected = toWorld(zoomed, { x: b.x + 20, y: b.y + 10 })
    expect(world.x).toBeCloseTo(expected.x, 6)
    expect(world.y).toBeCloseTo(expected.y, 6)
    w.unmount()
  })

  it('zooms with the buttons by one step about the centre, and reads it back', async () => {
    const w = await walked()
    const scale = view(w).scale
    await button(w, 'Zoom in').trigger('click')
    expect(readout(w)).toBe('Zoom 125%')
    expect(view(w).scale).toBeCloseTo(scale * ZOOM_STEP, 9)
    await button(w, 'Zoom out').trigger('click')
    expect(readout(w)).toBe('Zoom 100%')
    expect(resetButton(w)).toBeUndefined()
    await button(w, 'Zoom out').trigger('click')
    expect(readout(w)).toBe('Zoom 80%')
    w.unmount()
  })

  it('disables the buttons at both limits', async () => {
    const w = await walked()
    for (let i = 0; i < 40; i++) await wheel(w, -1e6, 300, 200)
    expect(readout(w)).toBe(`Zoom ${MAX_ZOOM * 100}%`)
    expect(button(w, 'Zoom in').attributes('disabled')).toBeDefined()
    expect(button(w, 'Zoom out').attributes('disabled')).toBeUndefined()
    for (let i = 0; i < 40; i++) await wheel(w, 1e6, 300, 200)
    expect(readout(w)).toBe(`Zoom ${MIN_ZOOM * 100}%`)
    expect(button(w, 'Zoom out').attributes('disabled')).toBeDefined()
    expect(button(w, 'Zoom in').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('zooms with the keyboard and resets with 0', async () => {
    const w = await walked()
    const before = view(w)
    await el(w).trigger('keydown', { key: '+' })
    await el(w).trigger('keydown', { key: '=' })
    expect(readout(w)).toBe('Zoom 156%')
    await el(w).trigger('keydown', { key: '-' })
    expect(readout(w)).toBe('Zoom 125%')
    await el(w).trigger('keydown', { key: '0' })
    expect(view(w)).toEqual(before)
    expect(readout(w)).toBe('Zoom 100%')
    w.unmount()
  })

  it('shows Reset view when only zoomed, and Reset view resets both pan and zoom', async () => {
    const w = await walked()
    const before = view(w)
    expect(resetButton(w)).toBeUndefined()
    await wheel(w, -200, 100, 100)
    expect(resetButton(w)).toBeDefined()
    await fire(w, 'pointerdown', 5, 5)
    await fire(w, 'pointermove', 45, 25)
    await fire(w, 'pointerup', 45, 25)
    await resetButton(w)!.trigger('click')
    expect(view(w)).toEqual(before)
    expect(resetButton(w)).toBeUndefined()
    expect(readout(w)).toBe('Zoom 100%')
    w.unmount()
  })

  it('resets both on a double-click of empty space', async () => {
    const w = await walked()
    const before = view(w)
    await wheel(w, -200, 100, 100)
    await fire(w, 'pointerdown', 5, 5)
    await fire(w, 'pointermove', 45, 25)
    await fire(w, 'pointerup', 45, 25)
    await fire(w, 'dblclick', 5, 5)
    expect(view(w)).toEqual(before)
    w.unmount()
  })

  it('keeps a node reachable when panned hard at both zoom extremes', async () => {
    for (const deltaY of [-1e6, 1e6]) {
      const w = await walked()
      for (let i = 0; i < 40; i++) await wheel(w, deltaY, 300, 200)
      for (let i = 0; i < 4; i++) {
        await fire(w, 'pointerdown', 700, 470)
        await fire(w, 'pointermove', 5, 5)
        await fire(w, 'pointerup', 5, 5)
      }
      const inside = ids.map((id) => screenOf(w, id)).filter((p) => p.x >= 47.9 && p.x <= 720 - 47.9 && p.y >= 47.9 && p.y <= 480 - 47.9)
      expect(inside.length).toBeGreaterThan(0)
      w.unmount()
    }
  })

  it('keeps the zoom across a refresh of the walk and when the drawer opens', async () => {
    const w = await walked()
    await wheel(w, -200, 300, 200)
    const zoomed = readout(w)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(readout(w)).toBe(zoomed)
    canvas(w).vm.$emit('select', 'http://c')
    await flushPromises()
    expect(readout(w)).toBe(zoomed)
    w.unmount()
  })

  it('keeps the scale bar true at every zoom', async () => {
    const w = await walked()
    const ratio = () => bar(w).px / bar(w).ms
    const base = ratio() / view(w).scale
    const shown: number[] = []
    for (const deltaY of [400, -400, -400, -400]) {
      await wheel(w, deltaY, 360, 240)
      expect(ratio() / view(w).scale).toBeCloseTo(base, 9)
      expect(bar(w).px).toBeLessThanOrEqual(120)
      shown.push(bar(w).ms / bar(w).px)
    }
    // Zoomed in far enough, the same pixels stand for fewer milliseconds.
    expect(shown[3]).toBeLessThan(shown[0])
    w.unmount()
  })

  it('hands the zoomed view to the canvas that draws the trace, with the viewer marker a fixed screen distance from the entry node', async () => {
    const w = await walked()
    canvas(w).vm.$emit('select', 'http://c')
    await flushPromises()
    const entry = screenOf(w, 'http://a')
    await wheel(w, -300, entry.x, entry.y)
    const zoomedView = view(w)
    const trace = w.get('[data-testid="trace-panel"]')
    await trace.findAll('button').find((b) => b.text() === 'Trace')!.trigger('click')
    await flushPromises()
    const props = canvas(w).props()
    expect(props.view).toEqual(zoomedView)
    expect(props.trace?.viewer?.label).toBe('This browser')
    expect(onScreen(props.view, props.trace!.viewer!.at, { width: 720, height: 480 })).toBe(true)
    const marker = toScreen(props.view, props.trace!.viewer!.at)
    expect(Math.hypot(marker.x - entry.x, marker.y - entry.y)).toBeCloseTo(84, 6)
    w.unmount()
  })
})
