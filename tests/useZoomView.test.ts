import { describe, expect, it } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import { useScaleBar } from '../src/composables/useScaleBar'
import { useZoomView } from '../src/composables/useZoomView'
import { clampPan, PAN_MARGIN_PX } from '../src/utils/pan'
import type { Layout, Point } from '../src/utils/layout'
import { fitView, toScreen, toWorld } from '../src/utils/viewport'
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../src/utils/zoom'

const start = { a: { x: 0, y: 0 }, b: { x: 100, y: 50 }, c: { x: 40, y: 120 } }

function make(initial: Record<string, Point> = start) {
  const positions = shallowRef(initial)
  const size = ref({ width: 400, height: 300 })
  const fitted = () => fitView(positions.value, size.value.width, size.value.height)
  const api = effectScope().run(() => useZoomView({ fitted, positions: () => positions.value, size: () => size.value }))!
  return { api, positions, size, fitted }
}

const onStage = (view: ReturnType<typeof fitView>, pts: Record<string, Point>, size: { width: number; height: number }, margin = PAN_MARGIN_PX) =>
  Object.values(pts).filter((p) => {
    const s = toScreen(view, p)
    return s.x >= margin - 1e-6 && s.x <= size.width - margin + 1e-6 && s.y >= margin - 1e-6 && s.y <= size.height - margin + 1e-6
  })

describe('useZoomView', () => {
  it('starts at the fitted view, unzoomed and unpanned', () => {
    const { api, fitted } = make()
    expect(api.view.value).toEqual(fitted())
    expect([api.zoom.value, api.percent.value, api.moved.value, api.zoomed.value, api.panned.value]).toEqual([1, 100, false, false, false])
  })

  it('multiplies the fit scale by the zoom', () => {
    const { api, fitted } = make()
    api.zoomBy(2)
    expect(api.view.value.scale).toBe(fitted().scale * 2)
    expect(api.percent.value).toBe(200)
  })

  it('keeps the world point under the pointer while zooming, and again after a pan', () => {
    const { api } = make()
    const at = { x: 250, y: 90 }
    const world = toWorld(api.view.value, at)
    api.zoomBy(3, at)
    expect(toScreen(api.view.value, world).x).toBeCloseTo(at.x, 6)
    expect(toScreen(api.view.value, world).y).toBeCloseTo(at.y, 6)
    api.panBy(-20, 10)
    const at2 = { x: 120, y: 200 }
    const world2 = toWorld(api.view.value, at2)
    api.zoomBy(0.5, at2)
    expect(toScreen(api.view.value, world2).x).toBeCloseTo(at2.x, 6)
    expect(toScreen(api.view.value, world2).y).toBeCloseTo(at2.y, 6)
  })

  it('zooms about the stage centre by default without panning', () => {
    const { api, size } = make()
    api.zoomIn()
    expect(api.zoom.value).toBe(ZOOM_STEP)
    expect(api.panned.value).toBe(false)
    api.zoomOut()
    expect(api.zoom.value).toBe(1)
    expect(api.moved.value).toBe(false)
    expect(size.value.width).toBe(400)
  })

  it('clamps at both limits and reports which way is still open', () => {
    const { api } = make()
    api.zoomBy(1e6)
    expect(api.zoom.value).toBe(MAX_ZOOM)
    expect([api.canZoomIn.value, api.canZoomOut.value]).toEqual([false, true])
    api.zoomBy(1.5)
    expect(api.zoom.value).toBe(MAX_ZOOM)
    api.zoomBy(1e-9)
    expect(api.zoom.value).toBe(MIN_ZOOM)
    expect([api.canZoomIn.value, api.canZoomOut.value]).toEqual([true, false])
  })

  it('does not move the view when a zoom is refused at a limit', () => {
    const { api } = make()
    api.zoomBy(1e6, { x: 30, y: 30 })
    const view = api.view.value
    api.zoomBy(2, { x: 300, y: 200 })
    expect(api.view.value).toEqual(view)
  })

  it('reset restores both pan and zoom exactly', () => {
    const { api, fitted } = make()
    api.zoomBy(4, { x: 10, y: 10 })
    api.panBy(30, 30)
    expect(api.moved.value).toBe(true)
    api.reset()
    expect(api.view.value).toEqual(fitted())
    expect(api.moved.value).toBe(false)
  })

  it('counts zoom alone as moved', () => {
    const { api } = make()
    api.zoomBy(2)
    expect([api.panned.value, api.zoomed.value, api.moved.value]).toEqual([false, true, true])
  })

  it('keeps a node inside the stage at every zoom, whatever the pan', () => {
    for (const z of [0.25, 0.5, 1, 4, 12]) {
      const { api, positions, size } = make()
      api.zoomBy(z)
      for (const [dx, dy] of [[-1e5, 0], [1e5, 0], [0, -1e5], [0, 1e5], [-1e5, -1e5], [1e5, 1e5]]) {
        api.panBy(dx, dy)
        expect(onStage(api.view.value, positions.value, size.value).length).toBeGreaterThan(0)
      }
    }
  })

  it('clamps the pan against the zoomed view, not the fitted one', () => {
    const { api, positions, size, fitted } = make()
    api.zoomBy(8)
    api.panBy(-1e5, 0)
    // Against the fitted view this pan would be far too large a range; against the zoomed view the rightmost node sits on the margin.
    const rightmost = Math.max(...Object.values(positions.value).map((p) => toScreen(api.view.value, p).x))
    expect(rightmost).toBeCloseTo(PAN_MARGIN_PX, 6)
    const wrong = clampPan({ dx: -1e5, dy: 0 }, positions.value, fitted(), size.value)
    expect(api.pan.value.dx).not.toBeCloseTo(wrong.dx, 0)
  })

  it('re-clamps right after a zoom step so the graph cannot be left out of reach', () => {
    const { api, positions, size } = make()
    api.zoomBy(0.25)
    api.panBy(1e5, 0)
    api.zoomBy(48, { x: 5, y: 5 })
    expect(onStage(api.view.value, positions.value, size.value).length).toBeGreaterThan(0)
  })

  it('keeps zoom and pan across a layout change and a stage resize', () => {
    const { api, positions, size } = make()
    api.zoomBy(2)
    api.panBy(10, 5)
    const pan = api.pan.value
    positions.value = { ...start, d: { x: 90, y: 90 } }
    size.value = { width: 500, height: 320 }
    expect(api.zoom.value).toBe(2)
    expect(api.pan.value).toEqual(pan)
  })
})

describe('useScaleBar', () => {
  const layout = (pxPerMs: number) => shallowRef({ positions: start, pxPerMs } as Layout)

  it('has no bar without a layout', () => {
    const { api } = make()
    const bar = effectScope().run(() => useScaleBar(shallowRef<Layout | null>(null), api.view))!
    expect(bar.value).toEqual({ px: 0, ms: 0 })
  })

  it('stays true at every zoom: the bar length in px is ms times pxPerMs times the derived scale', () => {
    const pxPerMs = 3.7
    for (const z of [0.5, 1, 4]) {
      const { api } = make()
      api.zoomBy(z, { x: 60, y: 40 })
      const bar = effectScope().run(() => useScaleBar(layout(pxPerMs), api.view))!
      expect(bar.value.ms).toBeGreaterThan(0)
      expect(bar.value.px).toBeCloseTo(pxPerMs * api.view.value.scale * bar.value.ms, 9)
      expect(bar.value.px).toBeLessThanOrEqual(120)
      expect([1, 2, 5]).toContain(Number(String(bar.value.ms).replace(/[.0]/g, '')[0]))
    }
  })

  it('shows fewer milliseconds per pixel as it zooms in', () => {
    const { api } = make()
    const bar = effectScope().run(() => useScaleBar(layout(3.7), api.view))!
    const msPerPx = () => bar.value.ms / bar.value.px
    const at1 = msPerPx()
    api.zoomBy(4)
    expect(msPerPx()).toBeLessThan(at1)
    expect(msPerPx()).toBeCloseTo(1 / (3.7 * api.view.value.scale), 9)
  })
})
