import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TopologyCanvas from '../src/components/TopologyCanvas.vue'
import { ZOOM_STEP } from '../src/utils/zoom'

const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, key: string) => (key === 'then' ? undefined : () => 1), set: () => true })

// Node a is at screen (200, 150) and b at (300, 150).
const props = () => ({
  positions: { 'http://a': { x: 0, y: 0 }, 'http://b': { x: 100, y: 0 } },
  links: [{ a: 'http://a', b: 'http://b' }],
  pinned: new Set<string>(),
  view: { scale: 1, tx: 200, ty: 150 },
  width: 400,
  height: 300,
})

type El = { element: Element }
// jsdom has no PointerEvent, so plain mouse events carry the pointer id.
const pointer = async (el: El, type: string, id: number, x: number, y: number) => {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })
  Object.defineProperty(e, 'pointerId', { value: id })
  el.element.dispatchEvent(e)
  await flushPromises()
}
const wheel = (el: El, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  el.element.dispatchEvent(e)
  return e
}

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never))
afterEach(() => vi.restoreAllMocks())

describe('wheel zoom', () => {
  it('zooms in for a scroll up and out for a scroll down, at the pointer', async () => {
    const w = mount(TopologyCanvas, { props: props() })
    const c = w.find('canvas')
    wheel(c, { deltaY: -100, clientX: 120, clientY: 80 })
    wheel(c, { deltaY: 100, clientX: 30, clientY: 40 })
    const [[f1, at1], [f2, at2]] = w.emitted('zoom') as [number, { x: number; y: number }][]
    expect(f1).toBeCloseTo(Math.exp(0.15), 12)
    expect(at1).toEqual({ x: 120, y: 80 })
    expect(f2).toBeCloseTo(Math.exp(-0.15), 12)
    expect(at2).toEqual({ x: 30, y: 40 })
  })

  it('prevents the page from scrolling', () => {
    const w = mount(TopologyCanvas, { props: props() })
    expect(wheel(w.find('canvas'), { deltaY: 100 }).defaultPrevented).toBe(true)
    expect(wheel(w.find('canvas'), { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true)
  })

  it('is more sensitive with ctrlKey (trackpad pinch) and normalises deltaMode', () => {
    const w = mount(TopologyCanvas, { props: props() })
    const c = w.find('canvas')
    wheel(c, { deltaY: -5 })
    wheel(c, { deltaY: -5, ctrlKey: true })
    wheel(c, { deltaY: -3, deltaMode: 1 })
    wheel(c, { deltaY: -48, deltaMode: 0 })
    const f = (w.emitted('zoom') as [number][]).map((z) => z[0])
    expect(f[1]).toBeGreaterThan(f[0])
    expect(f[1]).toBeCloseTo(Math.exp(0.05), 12)
    expect(f[2]).toBeCloseTo(f[3], 12)
  })

  it('emits nothing for a zero delta', () => {
    const w = mount(TopologyCanvas, { props: props() })
    wheel(w.find('canvas'), { deltaY: 0, deltaX: 40 })
    expect(w.emitted('zoom')).toBeUndefined()
  })
})

describe('zoom keys', () => {
  it('zooms in with + and =, out with - and _, about the stage centre', async () => {
    const w = mount(TopologyCanvas, { props: props() })
    const c = w.find('canvas')
    for (const key of ['+', '=', '-', '_']) await c.trigger('keydown', { key })
    expect(w.emitted('zoom')).toEqual([
      [ZOOM_STEP, { x: 200, y: 150 }],
      [ZOOM_STEP, { x: 200, y: 150 }],
      [1 / ZOOM_STEP, { x: 200, y: 150 }],
      [1 / ZOOM_STEP, { x: 200, y: 150 }],
    ])
  })

  it('leaves browser zoom shortcuts alone', async () => {
    const w = mount(TopologyCanvas, { props: props() })
    await w.find('canvas').trigger('keydown', { key: '+', ctrlKey: true })
    await w.find('canvas').trigger('keydown', { key: '-', metaKey: true })
    expect(w.emitted('zoom')).toBeUndefined()
  })

  it('still resets on 0 and pans on the arrows', async () => {
    const w = mount(TopologyCanvas, { props: props() })
    await w.find('canvas').trigger('keydown', { key: '0' })
    await w.find('canvas').trigger('keydown', { key: 'ArrowLeft' })
    expect(w.emitted('resetView')).toHaveLength(1)
    expect(w.emitted('pan')).toEqual([[40, 0]])
  })

  it('mentions scroll or pinch to zoom for assistive tech', () => {
    expect(mount(TopologyCanvas, { props: props() }).find('canvas').attributes('aria-label')).toMatch(/scroll or pinch to zoom/i)
  })
})

describe('pinch zoom', () => {
  const setup = () => {
    const w = mount(TopologyCanvas, { props: props() })
    const el = w.find('canvas').element as HTMLCanvasElement
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    return { w, c: w.find('canvas'), el }
  }
  const zooms = (w: ReturnType<typeof setup>['w']) => (w.emitted('zoom') ?? []) as [number, { x: number; y: number }][]

  it('zooms about the midpoint by the change in finger spread', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointermove', 2, 300, 100)
    expect(zooms(w)).toHaveLength(1)
    expect(zooms(w)[0][0]).toBeCloseTo(2, 12)
    expect(zooms(w)[0][1]).toEqual({ x: 150, y: 100 })
  })

  it('pans with the midpoint, and both in one move', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointermove', 1, 110, 120)
    await pointer(c, 'pointermove', 2, 210, 120)
    const pans = (w.emitted('pan') ?? []) as [number, number][]
    expect(pans.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])).toEqual([10, 20])
    // Moving both fingers the same way is a pure pan: the spread is unchanged after the second move.
    const total = zooms(w).reduce((m, z) => m * z[0], 1)
    expect(total).toBeCloseTo(1, 12)
  })

  it('does not select, pin or pan-as-drag when the press turns into a pinch', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 300, 150)
    await pointer(c, 'pointerdown', 2, 350, 150)
    await pointer(c, 'pointermove', 2, 380, 150)
    await pointer(c, 'pointerup', 2, 380, 150)
    await pointer(c, 'pointerup', 1, 300, 150)
    expect(w.emitted('pin')).toBeUndefined()
    expect(w.emitted('select')).toBeUndefined()
  })

  it('carries on as a plain pan when one finger lifts, without a jump or a select', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointermove', 2, 240, 100)
    const zoomsBefore = zooms(w).length
    const pansBefore = (w.emitted('pan') ?? []).length
    await pointer(c, 'pointerup', 2, 240, 100)
    // The remaining finger's first move is measured from where it was, not from the old midpoint.
    await pointer(c, 'pointermove', 1, 105, 100)
    const pans = (w.emitted('pan') ?? []) as [number, number][]
    expect(pans.slice(pansBefore)).toEqual([[5, 0]])
    expect(zooms(w)).toHaveLength(zoomsBefore)
    await pointer(c, 'pointerup', 1, 105, 100)
    expect(w.emitted('select')).toBeUndefined()
  })

  it('goes idle after both lift and accepts a fresh click', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointerup', 1, 100, 100)
    await pointer(c, 'pointerup', 2, 200, 100)
    await pointer(c, 'pointerdown', 3, 300, 150)
    await pointer(c, 'pointerup', 3, 300, 150)
    expect(w.emitted('select')).toEqual([['http://b']])
  })

  it('cleans up on pointercancel: no more zooming, no select, both pointers released', async () => {
    const { w, c, el } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    expect(el.setPointerCapture).toHaveBeenCalledTimes(2)
    await pointer(c, 'pointercancel', 2, 200, 100)
    expect(el.releasePointerCapture).toHaveBeenCalledTimes(2)
    await pointer(c, 'pointermove', 1, 10, 10)
    await pointer(c, 'pointermove', 2, 390, 10)
    await pointer(c, 'pointerup', 1, 10, 10)
    expect(w.emitted('zoom')).toBeUndefined()
    expect(w.emitted('pan')).toBeUndefined()
    expect(w.emitted('select')).toBeUndefined()
  })

  it('accepts a fresh click after a cancelled pinch', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointercancel', 1, 100, 100)
    await pointer(c, 'pointerdown', 5, 300, 150)
    await pointer(c, 'pointerup', 5, 300, 150)
    expect(w.emitted('select')).toEqual([['http://b']])
  })

  it('ignores a third finger and keeps one pinch', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointerdown', 3, 50, 50)
    await pointer(c, 'pointermove', 3, 60, 60)
    expect(w.emitted('zoom')).toBeUndefined()
    await pointer(c, 'pointermove', 2, 300, 100)
    expect(zooms(w)).toHaveLength(1)
  })

  it('ignores moves of a pointer that is not part of the pinch', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 100, 100)
    await pointer(c, 'pointerdown', 2, 200, 100)
    await pointer(c, 'pointermove', 9, 300, 300)
    await pointer(c, 'pointerup', 9, 300, 300)
    expect(w.emitted('zoom')).toBeUndefined()
    expect(w.emitted('pan')).toBeUndefined()
  })

  it('still treats a single pointer as pan, pin and click', async () => {
    const { w, c } = setup()
    await pointer(c, 'pointerdown', 1, 20, 20)
    await pointer(c, 'pointermove', 1, 60, 50)
    await pointer(c, 'pointerup', 1, 60, 50)
    expect(w.emitted('pan')).toEqual([[40, 30]])
    await pointer(c, 'pointerdown', 1, 300, 150)
    await pointer(c, 'pointermove', 1, 340, 190)
    await pointer(c, 'pointerup', 1, 340, 190)
    expect(w.emitted('pin')).toHaveLength(1)
    expect(w.emitted('zoom')).toBeUndefined()
  })
})
