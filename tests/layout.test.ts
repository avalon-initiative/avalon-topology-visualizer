import { describe, expect, it } from 'vitest'
import { computeLayout, linkLengthMs } from '../src/utils/layout'
import type { Layout, LayoutLink, Point } from '../src/utils/layout'

const dist = (l: Layout, a: string, b: string) => Math.hypot(l.positions[a].x - l.positions[b].x, l.positions[a].y - l.positions[b].y)
const diameter = (l: Layout) => {
  const ids = Object.keys(l.positions)
  return Math.max(...ids.flatMap((a) => ids.map((b) => dist(l, a, b))))
}
const maxMove = (from: Layout, to: Layout) =>
  Math.max(...Object.keys(from.positions).map((id) => Math.hypot(from.positions[id].x - to.positions[id].x, from.positions[id].y - to.positions[id].y)))
const pearson = (xs: number[], ys: number[]) => {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const mx = mean(xs)
  const my = mean(ys)
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  return cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0))
}

/** Every pair linked, RTT taken from a two-cluster ground truth: 5 ms inside a cluster, 80 ms between. */
function clusterMatrix() {
  const left = ['a1', 'a2', 'a3']
  const right = ['b1', 'b2', 'b3']
  const ids = [...left, ...right]
  const links: LayoutLink[] = []
  const rtt: Record<string, number> = {}
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const same = left.includes(ids[i]) === left.includes(ids[j])
      const ms = same ? 5 : 80
      links.push({ a: ids[i], b: ids[j], rttMs: ms })
      rtt[`${ids[i]}|${ids[j]}`] = ms
    }
  }
  return { ids, left, right, links, rtt }
}

describe('computeLayout', () => {
  it('is deterministic: the same data gives the same picture', () => {
    const { ids, links } = clusterMatrix()
    expect(computeLayout(ids, links)).toEqual(computeLayout(ids, links))
  })

  it('makes edge length track the measured round trip', () => {
    const layout = computeLayout(['a', 'b', 'c'], [
      { a: 'a', b: 'b', rttMs: 10 },
      { a: 'b', b: 'c', rttMs: 40 },
    ])
    const ab = dist(layout, 'a', 'b')
    const bc = dist(layout, 'b', 'c')
    expect(bc / ab).toBeGreaterThan(3.2)
    expect(bc / ab).toBeLessThan(4.8)
    expect(bc).toBeGreaterThan(40 * layout.pxPerMs * 0.8)
    expect(bc).toBeLessThan(40 * layout.pxPerMs * 1.2)
  })

  it('places known-close nodes closer than known-far nodes in a latency matrix', () => {
    const { ids, left, right, links, rtt } = clusterMatrix()
    const layout = computeLayout(ids, links)
    const intra: number[] = []
    const inter: number[] = []
    for (const key of Object.keys(rtt)) {
      const [a, b] = key.split('|')
      ;(left.includes(a) === left.includes(b) ? intra : inter).push(dist(layout, a, b))
    }
    expect(Math.max(...intra)).toBeLessThan(Math.min(...inter))
    expect(right).toHaveLength(3)
    const keys = Object.keys(rtt)
    expect(pearson(keys.map((k) => rtt[k]), keys.map((k) => dist(layout, ...(k.split('|') as [string, string]))))).toBeGreaterThan(0.95)
  })

  it('recovers a triangle: distances follow the round trips of all three sides', () => {
    const layout = computeLayout(['a', 'b', 'c'], [
      { a: 'a', b: 'b', rttMs: 30 },
      { a: 'b', b: 'c', rttMs: 40 },
      { a: 'a', b: 'c', rttMs: 50 },
    ])
    for (const [a, b, ms] of [['a', 'b', 30], ['b', 'c', 40], ['a', 'c', 50]] as const) {
      const expected = ms * layout.pxPerMs
      expect(dist(layout, a, b)).toBeGreaterThan(expected * 0.9)
      expect(dist(layout, a, b)).toBeLessThan(expected * 1.1)
    }
  })

  it('falls back to the coordinate estimate when nothing was measured', () => {
    const layout = computeLayout(['a', 'b'], [{ a: 'a', b: 'b', coordinateMs: 30 }], {}, undefined, { pxPerMs: 4 })
    expect(dist(layout, 'a', 'b')).toBeGreaterThan(30 * 4 * 0.9)
    expect(dist(layout, 'a', 'b')).toBeLessThan(30 * 4 * 1.1)
  })

  it('prefers a measurement over a coordinate estimate', () => {
    const layout = computeLayout(['a', 'b'], [{ a: 'a', b: 'b', rttMs: 10, coordinateMs: 90 }], {}, undefined, { pxPerMs: 4 })
    expect(dist(layout, 'a', 'b')).toBeLessThan(10 * 4 * 1.2)
  })

  it('does not let an unmeasured link distort the measured ones', () => {
    const layout = computeLayout(['a', 'b', 'c'], [
      { a: 'a', b: 'b', rttMs: 10 },
      { a: 'a', b: 'c', rttMs: 10 },
      { a: 'b', b: 'c' },
    ], {}, undefined, { pxPerMs: 6 })
    expect(dist(layout, 'a', 'b')).toBeGreaterThan(10 * 6 * 0.85)
    expect(dist(layout, 'a', 'b')).toBeLessThan(10 * 6 * 1.15)
    expect(dist(layout, 'a', 'c')).toBeGreaterThan(10 * 6 * 0.85)
    expect(dist(layout, 'a', 'c')).toBeLessThan(10 * 6 * 1.15)
  })

  it('keeps pinned nodes exactly where they were pinned', () => {
    const { ids, links } = clusterMatrix()
    const pins: Record<string, Point> = { a1: { x: 200, y: -50 }, b1: { x: -300, y: 120 } }
    const layout = computeLayout(ids, links, pins)
    expect(layout.positions.a1).toEqual(pins.a1)
    expect(layout.positions.b1).toEqual(pins.b1)
    expect(dist(layout, 'a1', 'a2')).toBeLessThan(dist(layout, 'a1', 'b2'))
  })

  it('ignores a pin for a node that is gone', () => {
    const layout = computeLayout(['a', 'b'], [{ a: 'a', b: 'b', rttMs: 10 }], { ghost: { x: 1, y: 1 } })
    expect(Object.keys(layout.positions).sort()).toEqual(['a', 'b'])
  })

  describe('stability across refreshes', () => {
    it('does not move anything when the data is unchanged', () => {
      const { ids, links } = clusterMatrix()
      const first = computeLayout(ids, links)
      const second = computeLayout(ids, links, {}, first)
      expect(maxMove(first, second)).toBeLessThan(diameter(first) * 0.03)
    })

    it('moves nodes only a little when round trips change slightly', () => {
      const { ids, links } = clusterMatrix()
      const first = computeLayout(ids, links)
      const jittered = links.map((l, i) => ({ ...l, rttMs: (l.rttMs ?? 0) * (1 + (i % 2 ? 0.05 : -0.05)) }))
      const second = computeLayout(ids, jittered, {}, first)
      expect(maxMove(first, second)).toBeLessThan(diameter(first) * 0.12)
    })

    it('places a new node near its neighbours and leaves the rest in place', () => {
      const { ids, links } = clusterMatrix()
      const first = computeLayout(ids, links)
      const second = computeLayout([...ids, 'a4'], [...links, { a: 'a4', b: 'a1', rttMs: 5 }, { a: 'a4', b: 'a2', rttMs: 5 }], {}, first)
      expect(maxMove(first, { ...second, positions: Object.fromEntries(ids.map((id) => [id, second.positions[id]])) })).toBeLessThan(diameter(first) * 0.15)
      expect(dist(second, 'a4', 'a1')).toBeLessThan(dist(second, 'a4', 'b1'))
    })

    it('does not shove existing nodes when a node joins through a single link', () => {
      const first = computeLayout(['a', 'b'], [{ a: 'a', b: 'b', rttMs: 10 }])
      const second = computeLayout(['a', 'b', 'c'], [{ a: 'a', b: 'b', rttMs: 10 }, { a: 'a', b: 'c', rttMs: 10 }], {}, first)
      expect(maxMove(first, { ...first, positions: { a: second.positions.a, b: second.positions.b } })).toBeLessThan(diameter(first) * 0.05)
      expect(dist(second, 'a', 'c')).toBeGreaterThan(10 * second.pxPerMs * 0.9)
      expect(dist(second, 'a', 'c')).toBeLessThan(10 * second.pxPerMs * 1.1)
    })

    it('keeps the scale between refreshes unless the data has outgrown it', () => {
      const { ids, links } = clusterMatrix()
      const first = computeLayout(ids, links)
      const slightly = computeLayout(ids, links.map((l) => ({ ...l, rttMs: (l.rttMs ?? 0) * 1.3 })), {}, first)
      expect(slightly.pxPerMs).toBe(first.pxPerMs)
      const grown = computeLayout(ids, links.map((l) => ({ ...l, rttMs: (l.rttMs ?? 0) * 10 })), {}, first)
      expect(grown.pxPerMs).toBeLessThan(first.pxPerMs)
    })
  })

  it('copes with no nodes, one node, self-links and links to unknown nodes', () => {
    expect(computeLayout([], []).positions).toEqual({})
    expect(Object.keys(computeLayout(['a'], []).positions)).toEqual(['a'])
    const layout = computeLayout(['a', 'b'], [{ a: 'a', b: 'a', rttMs: 5 }, { a: 'a', b: 'zzz', rttMs: 5 }, { a: 'a', b: 'b', rttMs: 20 }])
    expect(Object.keys(layout.positions).sort()).toEqual(['a', 'b'])
    expect(Number.isFinite(layout.positions.a.x + layout.positions.b.y)).toBe(true)
  })

  it('lays out disconnected groups finitely, each at its own scale, without overlapping nodes', () => {
    const ids = ['a', 'b', 'c', 'd']
    const layout = computeLayout(ids, [{ a: 'a', b: 'b', rttMs: 10 }, { a: 'c', b: 'd', rttMs: 20 }])
    for (const p of Object.values(layout.positions)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    expect(dist(layout, 'c', 'd') / dist(layout, 'a', 'b')).toBeGreaterThan(1.7)
    expect(dist(layout, 'c', 'd') / dist(layout, 'a', 'b')).toBeLessThan(2.3)
    for (const a of ids) for (const b of ids) if (a < b) expect(dist(layout, a, b)).toBeGreaterThanOrEqual(19)
  })
})

describe('linkLengthMs', () => {
  it('prefers a measurement, then an estimate, and otherwise reports unknown', () => {
    expect(linkLengthMs({ a: 'a', b: 'b', rttMs: 12, coordinateMs: 50 })).toEqual({ ms: 12, trust: 'measured' })
    expect(linkLengthMs({ a: 'a', b: 'b', coordinateMs: 50 })).toEqual({ ms: 50, trust: 'estimated' })
    expect(linkLengthMs({ a: 'a', b: 'b' })).toEqual({ ms: 0, trust: 'unknown' })
  })

  it('treats a zero or negative measurement as no measurement', () => {
    expect(linkLengthMs({ a: 'a', b: 'b', rttMs: 0, coordinateMs: 7 }).trust).toBe('estimated')
    expect(linkLengthMs({ a: 'a', b: 'b', rttMs: -3 }).trust).toBe('unknown')
  })
})
