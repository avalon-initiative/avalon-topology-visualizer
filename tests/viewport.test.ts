import { describe, expect, it } from 'vitest'
import { fitView, MAX_FIT_SCALE, nodeAt, onScreen, scaleBar, toScreen, toWorld } from '../src/utils/viewport'

describe('fitView', () => {
  it('zooms a tight layout in to fill the canvas and centres it', () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 150 } }
    const view = fitView(positions, 400, 300, 40)
    expect(view.scale).toBeCloseTo(220 / 150)
    expect(toScreen(view, { x: 50, y: 75 })).toEqual({ x: 200, y: 150 })
    expect(toScreen(view, positions.a).y).toBeCloseTo(40)
    expect(toScreen(view, positions.b).y).toBeCloseTo(260)
  })

  it('never zooms in past the cap, so a near-degenerate layout is not blown up', () => {
    const view = fitView({ a: { x: -1, y: 0 }, b: { x: 1, y: 0 } }, 400, 300)
    expect(view.scale).toBe(MAX_FIT_SCALE)
    expect(toScreen(view, { x: 0, y: 0 })).toEqual({ x: 200, y: 150 })
  })

  it('shrinks a layout that would overflow so every node stays inside the padding', () => {
    const positions = { a: { x: -1000, y: -500 }, b: { x: 1000, y: 500 } }
    const view = fitView(positions, 400, 300, 40)
    expect(view.scale).toBeLessThan(1)
    for (const p of Object.values(positions)) {
      const s = toScreen(view, p)
      expect(s.x).toBeGreaterThanOrEqual(39.999)
      expect(s.x).toBeLessThanOrEqual(360.001)
      expect(s.y).toBeGreaterThanOrEqual(39.999)
      expect(s.y).toBeLessThanOrEqual(260.001)
    }
  })

  it('handles no nodes and a single node', () => {
    expect(fitView({}, 400, 300)).toEqual({ scale: 1, tx: 200, ty: 150 })
    expect(fitView({ a: { x: 50, y: 50 } }, 400, 300).scale).toBe(MAX_FIT_SCALE)
    expect(toScreen(fitView({ a: { x: 50, y: 50 } }, 400, 300), { x: 50, y: 50 })).toEqual({ x: 200, y: 150 })
  })
})

describe('toScreen / toWorld', () => {
  it('are inverses', () => {
    const view = { scale: 0.5, tx: 30, ty: -20 }
    const p = { x: 123, y: -45 }
    const back = toWorld(view, toScreen(view, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })
})

describe('nodeAt', () => {
  const view = { scale: 1, tx: 0, ty: 0 }
  const positions = { a: { x: 10, y: 10 }, b: { x: 20, y: 10 } }

  it('returns the nearest node within the radius', () => {
    expect(nodeAt(positions, view, { x: 12, y: 10 })).toBe('a')
    expect(nodeAt(positions, view, { x: 18, y: 10 })).toBe('b')
  })

  it('returns nothing on empty space', () => {
    expect(nodeAt(positions, view, { x: 300, y: 300 })).toBeUndefined()
  })

  it('accounts for the view transform', () => {
    expect(nodeAt(positions, { scale: 2, tx: 100, ty: 0 }, { x: 120, y: 20 })).toBe('a')
  })
})

describe('scaleBar', () => {
  it.each([
    [1, 120, 100],
    [4, 120, 20],
    [0.5, 120, 200],
    [10, 120, 10],
    [3, 120, 20],
  ])('picks a round millisecond value for %s px/ms', (pxPerMs, maxPx, expectedMs) => {
    const bar = scaleBar(pxPerMs, { scale: 1, tx: 0, ty: 0 }, maxPx)
    expect(bar.ms).toBe(expectedMs)
    expect(bar.px).toBeLessThanOrEqual(maxPx)
    expect(bar.px).toBeCloseTo(expectedMs * pxPerMs)
  })

  it('shows the on-screen scale when the view is zoomed out', () => {
    const bar = scaleBar(4, { scale: 0.5, tx: 0, ty: 0 })
    expect(bar.px).toBeCloseTo(bar.ms * 4 * 0.5)
  })

  it('shows nothing for a degenerate scale', () => {
    expect(scaleBar(0, { scale: 1, tx: 0, ty: 0 })).toEqual({ px: 0, ms: 0 })
  })
})

describe('onScreen', () => {
  const view = { scale: 2, tx: 10, ty: 10 }
  const size = { width: 400, height: 300 }

  it('accepts points inside the canvas and rejects those near or past an edge', () => {
    expect(onScreen(view, { x: 100, y: 50 }, size)).toBe(true)
    expect(onScreen(view, { x: 0, y: 50 }, size)).toBe(false)
    expect(onScreen(view, { x: 100, y: 0 }, size)).toBe(false)
    expect(onScreen(view, { x: 190, y: 50 }, size)).toBe(false)
    expect(onScreen(view, { x: 100, y: 140 }, size)).toBe(false)
  })

  it('keeps extra room under the point for a label', () => {
    expect(onScreen(view, { x: 100, y: 100 }, size)).toBe(true)
    expect(onScreen(view, { x: 100, y: 118 }, size)).toBe(false)
  })
})
