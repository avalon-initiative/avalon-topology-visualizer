import { describe, expect, it } from 'vitest'
import { applyPan, clampPan, isPanned, NO_PAN, PAN_MARGIN_PX } from '../src/utils/pan'
import { fitView, toScreen } from '../src/utils/viewport'

const size = { width: 400, height: 300 }
const positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } }
const fitted = fitView(positions, size.width, size.height)
const box = () => {
  const s = Object.values(positions).map((p) => toScreen(fitted, p))
  return { minX: Math.min(...s.map((p) => p.x)), maxX: Math.max(...s.map((p) => p.x)), minY: Math.min(...s.map((p) => p.y)), maxY: Math.max(...s.map((p) => p.y)) }
}

describe('applyPan', () => {
  it('shifts the translation and leaves the scale alone', () => {
    expect(applyPan({ scale: 2, tx: 10, ty: 20 }, { dx: 5, dy: -7 })).toEqual({ scale: 2, tx: 15, ty: 13 })
  })
})

describe('isPanned', () => {
  it('is true for any non-zero offset', () => {
    expect(isPanned(NO_PAN)).toBe(false)
    expect(isPanned({ dx: 0, dy: 1 })).toBe(true)
    expect(isPanned({ dx: -1, dy: 0 })).toBe(true)
  })
})

describe('clampPan', () => {
  const nodesOnStage = (pan: { dx: number; dy: number }, margin = PAN_MARGIN_PX, pts = positions, view = fitted) =>
    Object.values(pts).filter((p) => {
      const s = toScreen(view, p)
      return s.x + pan.dx >= margin - 1e-6 && s.x + pan.dx <= size.width - margin + 1e-6 && s.y + pan.dy >= margin - 1e-6 && s.y + pan.dy <= size.height - margin + 1e-6
    })

  it('leaves a pan that keeps a node on the stage alone', () => {
    expect(clampPan({ dx: 30, dy: -20 }, positions, fitted, size)).toEqual({ dx: 30, dy: -20 })
    expect(clampPan(NO_PAN, positions, fitted, size)).toEqual(NO_PAN)
  })

  it('stops the graph leaving past each edge, keeping a node inside the margin', () => {
    const b = box()
    const left = clampPan({ dx: -9999, dy: 0 }, positions, fitted, size)
    expect(b.maxX + left.dx).toBeCloseTo(PAN_MARGIN_PX)
    const right = clampPan({ dx: 9999, dy: 0 }, positions, fitted, size)
    expect(b.minX + right.dx).toBeCloseTo(size.width - PAN_MARGIN_PX)
    const up = clampPan({ dx: 0, dy: -9999 }, positions, fitted, size)
    expect(b.maxY + up.dy).toBeCloseTo(PAN_MARGIN_PX)
    const down = clampPan({ dx: 0, dy: 9999 }, positions, fitted, size)
    expect(b.minY + down.dy).toBeCloseTo(size.height - PAN_MARGIN_PX)
    for (const c of [left, right, up, down]) expect(nodesOnStage(c)).not.toHaveLength(0)
  })

  it('keeps a node, not just a corner of the bounding box, on the stage when dragged diagonally', () => {
    const diagonal = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, c: { x: 100, y: 0 }, d: { x: 0, y: 100 } }
    const view = fitView(diagonal, size.width, size.height)
    for (const [dx, dy] of [[-9999, -9999], [9999, 9999], [-9999, 9999], [9999, -9999]]) {
      expect(nodesOnStage(clampPan({ dx, dy }, diagonal, view, size), PAN_MARGIN_PX, diagonal, view).length).toBeGreaterThan(0)
    }
  })

  it('clamps each axis on its own', () => {
    const c = clampPan({ dx: 10, dy: 9999 }, positions, fitted, size)
    expect(c.dx).toBe(10)
    expect(c.dy).toBeGreaterThan(10)
  })

  it('honours a custom margin', () => {
    expect(box().maxX + clampPan({ dx: -9999, dy: 0 }, positions, fitted, size, 10).dx).toBeCloseTo(10)
  })

  it('moves a graph much smaller than the stage the same way', () => {
    const tiny = { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }
    const view = fitView(tiny, size.width, size.height)
    const c = clampPan({ dx: -9999, dy: 0 }, tiny, view, size)
    expect(Math.max(...Object.values(tiny).map((p) => toScreen(view, p).x)) + c.dx).toBeCloseTo(PAN_MARGIN_PX)
  })

  it('handles a single node', () => {
    const one = { a: { x: 5, y: 5 } }
    const view = fitView(one, size.width, size.height)
    expect(toScreen(view, one.a).x + clampPan({ dx: 9999, dy: 0 }, one, view, size).dx).toBeCloseTo(size.width - PAN_MARGIN_PX)
  })

  it('has nothing to keep for an empty graph', () => {
    expect(clampPan({ dx: 50, dy: 50 }, {}, fitView({}, 400, 300), size)).toEqual(NO_PAN)
  })

  it('does not throw or return NaN when the stage is smaller than twice the margin', () => {
    const c = clampPan({ dx: 500, dy: -500 }, positions, fitted, { width: 60, height: 60 })
    expect(Number.isFinite(c.dx) && Number.isFinite(c.dy)).toBe(true)
  })
})
