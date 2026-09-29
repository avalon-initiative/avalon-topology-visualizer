import { describe, expect, it } from 'vitest'
import { estimateWidth, LABEL_HEIGHT, MUST_RANK, placeLabels, shortLabel } from '../src/utils/labelLayout'
import type { LabelItem, LabelPlacement, Rect } from '../src/utils/labelLayout'

const item = (i: number, x: number, y: number, rank = 0): LabelItem => {
  const text = `192.168.7.${100 + i}:8080`
  return { id: `n${String(i).padStart(2, '0')}`, at: { x, y }, radius: 12, text, short: shortLabel(text), rank }
}
const canvas = { width: 800, height: 600 }
const shown = (m: Map<string, LabelPlacement>) => [...m.values()].filter((p) => p.mode !== 'hidden')
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const noOverlaps = (m: Map<string, LabelPlacement>) => {
  const list = shown(m)
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(hit(list[i].box, list[j].box), `${list[i].id} vs ${list[j].id}`).toBe(false)
}
const cluster5 = () => [item(0, 400, 300), item(1, 410, 305), item(2, 395, 315), item(3, 420, 292), item(4, 600, 200)]
const grid30 = () => Array.from({ length: 30 }, (_, i) => item(i, 380 + (i % 6) * 9, 280 + Math.floor(i / 6) * 9))

describe('shortLabel', () => {
  it('keeps the last octet of an address and drops the port', () => expect(shortLabel('192.168.7.194:8080')).toBe('.194'))
  it('keeps the first label of a host name', () => expect(shortLabel('node-a.example.com:8080')).toBe('node-a'))
  it('trims a long single label', () => expect(shortLabel('averyverylonghostname')).toBe('averyve…'))
  it('leaves a short label alone', () => expect(shortLabel('You')).toBe('You'))
})

describe('placeLabels', () => {
  it('puts a lone node label below it, inside the canvas', () => {
    const p = placeLabels([item(0, 400, 300)], canvas).get('n00')!
    expect(p.mode).toBe('full')
    expect(p.slot).toBe('below:0')
    expect(p.leader).toBeUndefined()
    expect(p.box.y).toBeGreaterThan(300)
  })

  it('places no two labels on top of each other in a tight 5-node cluster', () => {
    const m = placeLabels(cluster5(), canvas)
    expect(shown(m).length).toBe(5)
    noOverlaps(m)
  })

  it('places no two labels on top of each other in a 30-node cluster, still showing a dozen', () => {
    const m = placeLabels(grid30(), canvas)
    noOverlaps(m)
    expect(shown(m).length).toBeGreaterThanOrEqual(12)
  })

  it('keeps labels off every node', () => {
    const items = grid30()
    for (const p of shown(placeLabels(items, canvas))) {
      for (const n of items) {
        const nx = Math.max(p.box.x, Math.min(n.at.x, p.box.x + p.box.w))
        const ny = Math.max(p.box.y, Math.min(n.at.y, p.box.y + p.box.h))
        expect(Math.hypot(nx - n.at.x, ny - n.at.y), `${p.id} over ${n.id}`).toBeGreaterThan(5)
      }
    }
  })

  it('gives a moved-away label a leader line and leaves a beside label without one', () => {
    const m = placeLabels(grid30(), canvas)
    const far = shown(m).find((p) => !p.slot.endsWith(':0'))!
    expect(far.leader).toBeDefined()
    expect(shown(m).find((p) => p.slot.endsWith(':0'))!.leader).toBeUndefined()
  })

  it('always gives priority nodes a full label, even when crowded', () => {
    const items = grid30().map((n, i) => (i % 5 === 0 ? { ...n, rank: MUST_RANK } : n))
    const m = placeLabels(items, canvas)
    for (const n of items.filter((n) => n.rank >= MUST_RANK)) {
      expect(m.get(n.id)!.mode).toBe('full')
      expect(m.get(n.id)!.text).toBe(n.text)
    }
  })

  it('places higher ranks first, so they get the nearest slot', () => {
    const a = { ...item(0, 400, 300), rank: 0 }
    const b = { ...item(1, 400, 300), rank: 3 }
    const m = placeLabels([a, b], canvas)
    expect(m.get('n01')!.slot).toBe('below:0')
    expect(m.get('n00')!.slot).not.toBe('below:0')
  })

  it('falls back to the short form, then hides, when there is no room', () => {
    const m = placeLabels(grid30(), { width: 260, height: 90 })
    const modes = new Set([...m.values()].map((p) => p.mode))
    expect(modes.has('short') || modes.has('hidden')).toBe(true)
    for (const p of m.values()) if (p.mode === 'short') expect(p.text).toMatch(/^\.\d+$/)
    for (const p of m.values()) if (p.mode === 'hidden') expect(p.text).toBe('')
    noOverlaps(m)
  })

  it('uses the short form beside the node before a full label on a leader', () => {
    const crowded = [item(0, 60, 30), item(1, 66, 34)]
    const m = placeLabels(crowded, { width: 130, height: 80 })
    const p = [...m.values()].find((x) => x.mode === 'short')
    expect(p).toBeDefined()
    expect(p!.text).toMatch(/^\.\d+$/)
  })

  it('never hides a must-have label; it takes the least bad slot instead', () => {
    const items = grid30().map((n) => ({ ...n, rank: MUST_RANK }))
    const m = placeLabels(items, { width: 300, height: 100 })
    expect([...m.values()].every((p) => p.mode === 'full')).toBe(true)
  })

  it('clamps labels inside the canvas at every edge', () => {
    const items = [item(0, 3, 3), item(1, 797, 3), item(2, 3, 597), item(3, 797, 597), item(4, 400, 2), item(5, 400, 598)]
    for (const p of shown(placeLabels(items, canvas))) {
      expect(p.box.x).toBeGreaterThanOrEqual(0)
      expect(p.box.y).toBeGreaterThanOrEqual(0)
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(canvas.width)
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(canvas.height)
    }
  })

  it('keeps a must-have label on the canvas even when it must be shifted', () => {
    const p = placeLabels([item(0, 5, 5, MUST_RANK)], { width: 120, height: 30 }).get('n00')!
    expect(p.box.x).toBeGreaterThanOrEqual(0)
    expect(p.box.y).toBeGreaterThanOrEqual(0)
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(120)
  })

  it('is deterministic and independent of input order', () => {
    const a = placeLabels(cluster5(), canvas)
    const b = placeLabels([...cluster5()].reverse(), canvas)
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort())
  })

  it('is stable across frames: feeding the slots back and nudging the nodes changes nothing', () => {
    const first = placeLabels(grid30(), canvas)
    const previous = new Map([...first.values()].map((p) => [p.id, p.slot]))
    const nudged = grid30().map((n) => ({ ...n, at: { x: n.at.x + 0.4, y: n.at.y - 0.3 } }))
    const second = placeLabels(nudged, { ...canvas, previous })
    expect([...second.values()].map((p) => [p.id, p.slot, p.mode])).toEqual([...first.values()].map((p) => [p.id, p.slot, p.mode]))
  })

  it('tries the previous slot first when it is still free', () => {
    const lone = item(0, 400, 300)
    const p = placeLabels([lone], { ...canvas, previous: new Map([['n00', 'right:0']]) }).get('n00')!
    expect(p.slot).toBe('right:0')
  })

  it('a hovered node (highest rank, full text) displaces a hidden label', () => {
    const items = grid30()
    const size = { width: 260, height: 90 }
    const before = placeLabels(items, size)
    const hiddenId = [...before.values()].find((p) => p.mode !== 'full')!.id
    const after = placeLabels(items.map((n) => (n.id === hiddenId ? { ...n, rank: 4 } : n)), size)
    expect(after.get(hiddenId)!.mode).toBe('full')
    expect(after.get(hiddenId)!.text).toContain('192.168.7.')
  })

  it('measures text through the given function', () => {
    const wide = placeLabels([item(0, 400, 300)], { ...canvas, measure: () => 200 }).get('n00')!
    const narrow = placeLabels([item(0, 400, 300)], { ...canvas, measure: () => 20 }).get('n00')!
    expect(wide.box.w).toBeGreaterThan(narrow.box.w)
    expect(narrow.box.h).toBe(LABEL_HEIGHT)
    expect(estimateWidth('abcd')).toBeGreaterThan(0)
  })

  it('handles no nodes', () => expect(placeLabels([], canvas).size).toBe(0))
})
