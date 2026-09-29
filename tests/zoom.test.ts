import { describe, expect, it } from 'vitest'
import { applyPan } from '../src/utils/pan'
import { fitView, toScreen, toWorld } from '../src/utils/viewport'
import { canZoomIn, canZoomOut, clampZoom, isZoomed, MAX_ZOOM, MIN_ZOOM, pinchStep, wheelFactor, zoomAt, zoomBase, zoomPercent, ZOOM_STEP } from '../src/utils/zoom'

const size = { width: 400, height: 300 }
const fitted = fitView({ a: { x: 0, y: 0 }, b: { x: 100, y: 50 } }, size.width, size.height)

describe('limits', () => {
  it('exports the documented range and step', () => {
    expect([MIN_ZOOM, MAX_ZOOM, ZOOM_STEP]).toEqual([0.25, 12, 1.25])
  })

  it('clamps to both limits and leaves values between them alone', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(1000)).toBe(MAX_ZOOM)
    expect(clampZoom(0.25)).toBe(0.25)
    expect(clampZoom(12)).toBe(12)
    expect(clampZoom(3.3)).toBe(3.3)
  })

  it('can zoom in and out everywhere but at the matching limit', () => {
    expect([canZoomIn(MAX_ZOOM), canZoomIn(11.99), canZoomIn(MIN_ZOOM)]).toEqual([false, true, true])
    expect([canZoomOut(MIN_ZOOM), canZoomOut(0.26), canZoomOut(MAX_ZOOM)]).toEqual([false, true, true])
  })

  it('reports zoomed and a whole-number percentage', () => {
    expect([isZoomed(1), isZoomed(1.25), isZoomed(0.5)]).toEqual([false, true, true])
    expect([zoomPercent(1), zoomPercent(1.5), zoomPercent(0.25), zoomPercent(12), zoomPercent(1.2345)]).toEqual([100, 150, 25, 1200, 123])
  })
})

describe('zoomBase', () => {
  it('is the fitted view itself at zoom 1', () => {
    expect(zoomBase(fitted, 1, size)).toBe(fitted)
  })

  it('scales about the stage centre, so the fitted centre stays centred', () => {
    const b = zoomBase(fitted, 2, size)
    expect(b.scale).toBe(fitted.scale * 2)
    const centreWorld = toWorld(fitted, { x: 200, y: 150 })
    expect(toScreen(b, centreWorld).x).toBeCloseTo(200)
    expect(toScreen(b, centreWorld).y).toBeCloseTo(150)
  })
})

describe('zoomAt', () => {
  it('has an exact result for a known case', () => {
    const view = { scale: 2, tx: 100, ty: 50 }
    const wide = { width: 400, height: 200 }
    // The zoom-2 base has tx = 200 + (100 - 200) * 2 = 0 and ty = 100 + (50 - 100) * 2 = 0. Screen (300, 100) is world (100, 25) at
    // zoom 1, so at zoom 2 (scale 4) it needs 100 * 4 + 0 + dx = 300 and 25 * 4 + 0 + dy = 100.
    expect(zoomAt(view, wide, { dx: 0, dy: 0 }, 1, 2, { x: 300, y: 100 })).toEqual({ dx: -100, dy: 0 })
  })

  it('keeps the world point under the anchor fixed, for many zooms, pans and anchors', () => {
    for (const zoom of [0.25, 0.5, 1, 2.5, 12]) {
      for (const next of [0.25, 0.7, 1, 1.25, 4, 12]) {
        for (const pan of [{ dx: 0, dy: 0 }, { dx: 37, dy: -21 }]) {
          for (const anchor of [{ x: 0, y: 0 }, { x: 123, y: 77 }, { x: 400, y: 300 }]) {
            const before = applyPan(zoomBase(fitted, zoom, size), pan)
            const world = toWorld(before, anchor)
            const after = applyPan(zoomBase(fitted, next, size), zoomAt(fitted, size, pan, zoom, next, anchor))
            expect(after.scale).toBeCloseTo(fitted.scale * next, 9)
            expect(toScreen(after, world).x).toBeCloseTo(anchor.x, 6)
            expect(toScreen(after, world).y).toBeCloseTo(anchor.y, 6)
          }
        }
      }
    }
  })

  it('needs no pan to zoom about the stage centre of an unpanned view, and leaves no float dust after a round trip', () => {
    const centre = { x: 200, y: 150 }
    const pan = zoomAt(fitted, size, { dx: 0, dy: 0 }, 1, 1.25, centre)
    expect(pan).toEqual({ dx: 0, dy: 0 })
    const there = zoomAt(fitted, size, { dx: 0, dy: 0 }, 1, 3, { x: 50, y: 60 })
    const back = zoomAt(fitted, size, there, 3, 1, { x: 50, y: 60 })
    expect(back).toEqual({ dx: 0, dy: 0 })
  })

  it('is the identity when the zoom does not change', () => {
    expect(zoomAt(fitted, size, { dx: 9, dy: -4 }, 2, 2, { x: 10, y: 10 })).toEqual({ dx: 9, dy: -4 })
  })
})

describe('wheelFactor', () => {
  const e = (deltaY: number, extra: Partial<{ deltaMode: number; ctrlKey: boolean }> = {}) => ({ deltaY, deltaMode: 0, ctrlKey: false, ...extra })

  it('zooms in for negative deltaY, out for positive, and not at all for zero', () => {
    expect(wheelFactor(e(-100))).toBeGreaterThan(1)
    expect(wheelFactor(e(100))).toBeLessThan(1)
    expect(wheelFactor(e(0))).toBe(1)
  })

  it('is exponential: opposite deltas cancel and deltas add in the exponent', () => {
    expect(wheelFactor(e(-100))).toBeCloseTo(Math.exp(0.15), 12)
    expect(wheelFactor(e(50)) * wheelFactor(e(-50))).toBeCloseTo(1, 12)
    expect(wheelFactor(e(20)) * wheelFactor(e(30))).toBeCloseTo(wheelFactor(e(50)), 12)
  })

  it('is much more sensitive with ctrlKey, which is how a trackpad pinch arrives', () => {
    expect(wheelFactor(e(-5, { ctrlKey: true }))).toBeCloseTo(Math.exp(0.05), 12)
    expect(wheelFactor(e(-5, { ctrlKey: true }))).toBeGreaterThan(wheelFactor(e(-5)))
  })

  it('normalises lines and pages to pixels', () => {
    expect(wheelFactor(e(-3, { deltaMode: 1 }))).toBeCloseTo(wheelFactor(e(-48)), 12)
    expect(wheelFactor(e(-0.5, { deltaMode: 2 }))).toBeCloseTo(wheelFactor(e(-200)), 12)
  })

  it('caps one event so a huge delta cannot jump the zoom', () => {
    expect(wheelFactor(e(-100000))).toBeCloseTo(Math.exp(240 * 0.0015), 12)
    expect(wheelFactor(e(100000))).toBeCloseTo(Math.exp(-240 * 0.0015), 12)
  })
})

describe('pinchStep', () => {
  it('reads the spread ratio and both midpoints', () => {
    const s = pinchStep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: -50, y: 10 }, { x: 150, y: 10 }])
    expect(s.factor).toBe(2)
    expect(s.from).toEqual({ x: 50, y: 0 })
    expect(s.to).toEqual({ x: 50, y: 10 })
  })

  it('has factor 1 for a pure translation and for fingers that start on the same spot', () => {
    expect(pinchStep([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 5, y: 5 }, { x: 15, y: 5 }]).factor).toBe(1)
    expect(pinchStep([{ x: 3, y: 3 }, { x: 3, y: 3 }], [{ x: 0, y: 0 }, { x: 9, y: 9 }]).factor).toBe(1)
  })

  it('shrinks below 1 when the fingers come together', () => {
    expect(pinchStep([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 25, y: 0 }, { x: 75, y: 0 }]).factor).toBe(0.5)
  })
})
