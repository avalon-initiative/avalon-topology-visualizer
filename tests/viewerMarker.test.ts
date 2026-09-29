import { describe, expect, it } from 'vitest'
import { placeViewerMarker } from '../src/utils/viewerMarker'

const opts = { distance: 60, clearance: 40 }
const gap = (p: { x: number; y: number }, nodes: { x: number; y: number }[]) => Math.min(...nodes.map((n) => Math.hypot(n.x - p.x, n.y - p.y)))

describe('placeViewerMarker', () => {
  it('sits the given distance from the entry node, away from the centre of the graph', () => {
    const nodes = [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]
    const p = placeViewerMarker({ x: 100, y: 0 }, nodes, opts)
    expect(p).toEqual({ x: 160, y: 0 })
  })

  it('goes up when the entry node is at the centre, so there is always an answer', () => {
    const p = placeViewerMarker({ x: 0, y: 0 }, [{ x: 0, y: 0 }], opts)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(-60)
  })

  it('turns aside when another node is in the way', () => {
    const entry = { x: 100, y: 0 }
    const nodes = [{ x: -100, y: 0 }, entry, { x: 160, y: 0 }]
    const p = placeViewerMarker(entry, nodes, opts)
    expect(p).not.toEqual({ x: 160, y: 0 })
    expect(gap(p, nodes)).toBeGreaterThanOrEqual(opts.clearance)
    expect(Math.hypot(p.x - entry.x, p.y - entry.y)).toBeCloseTo(60)
  })

  it('never lands within the clearance of any node across many layouts', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nodes = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos(seed * (i + 1)) * 90, y: Math.sin(seed * (i * 2 + 1)) * 90 }))
      const entry = nodes[seed % nodes.length]
      const p = placeViewerMarker(entry, nodes, opts)
      expect(gap(p, nodes)).toBeGreaterThanOrEqual(opts.clearance - 1e-9)
    }
  })

  it('is deterministic', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: -20, y: 50 }]
    expect(placeViewerMarker(nodes[1], nodes, opts)).toEqual(placeViewerMarker(nodes[1], nodes, opts))
  })

  it('falls back to the roomiest spot when every direction is crowded', () => {
    const entry = { x: 0, y: 0 }
    const ring = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 6) * 60, y: Math.sin((i * Math.PI) / 6) * 60 }))
    const p = placeViewerMarker(entry, [entry, ...ring], { distance: 60, clearance: 500 })
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })

  it('skips spots the caller rejects, such as ones off the visible map', () => {
    const nodes = [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]
    const p = placeViewerMarker({ x: 100, y: 0 }, nodes, { ...opts, accept: (q) => q.x <= 150 })
    expect(p.x).toBeLessThanOrEqual(150)
    expect(gap(p, nodes)).toBeGreaterThanOrEqual(opts.clearance)
  })

  it('prefers an accepted spot over a roomier one that is rejected, and still answers when none is accepted', () => {
    const entry = { x: 0, y: 0 }
    const p = placeViewerMarker(entry, [entry], { ...opts, accept: (q) => q.y > 0 })
    expect(p.y).toBeGreaterThan(0)
    expect(placeViewerMarker(entry, [entry], { ...opts, accept: () => false })).toBeDefined()
  })
})
