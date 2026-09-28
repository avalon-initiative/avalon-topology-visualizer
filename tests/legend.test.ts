import { describe, expect, it } from 'vitest'
import { arcPath, glyphGeometry, legendGroups } from '../src/utils/legend'

describe('legendGroups', () => {
  const items = legendGroups().flatMap((g) => g.items)

  it('covers links, role shapes, version rings and node states', () => {
    expect(legendGroups().map((g) => g.title)).toEqual(['Links', 'Node role (shape)', 'Protocol version (ring)', 'Node state'])
  })

  it('names every mark in words that do not depend on colour', () => {
    for (const item of items) expect(item.label.length).toBeGreaterThan(8)
    expect(items.find((i) => i.id === 'active')?.label).toMatch(/solid/i)
    expect(items.find((i) => i.id === 'known')?.label).toMatch(/dashed/i)
    expect(items.find((i) => i.id === 'mirror')?.label).toMatch(/arrow/i)
    expect(items.find((i) => i.id === 'version-behind')?.label).toMatch(/dashed/i)
    expect(items.find((i) => i.id === 'stale')?.label).toMatch(/faded/i)
  })

  it('has unique ids', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('gives all five role shapes a different glyph', () => {
    const roles = legendGroups()[1].items
    expect(new Set(roles.map((i) => JSON.stringify(i.glyph))).size).toBe(5)
  })
})

describe('glyphGeometry', () => {
  it('gives polygon shapes points and circles none', () => {
    expect(glyphGeometry({ type: 'node', shape: 'square' }).points?.split(' ')).toHaveLength(4)
    expect(glyphGeometry({ type: 'node', shape: 'circle' }).points).toBeNull()
  })

  it('maps the version state to a ring pattern', () => {
    const ring = (version?: 'newest' | 'behind' | 'unknown') => glyphGeometry({ type: 'node', shape: 'circle', version }).ring
    expect(ring('newest')).toBe('solid')
    expect(ring('behind')).toBe('dashed')
    expect(ring('unknown')).toBe('dotted')
    expect(ring()).toBeNull()
  })

  it('draws a lag arc only when there is lag', () => {
    expect(glyphGeometry({ type: 'node', shape: 'circle', lag: 0.5 }).lagArc).toMatch(/^M /)
    expect(glyphGeometry({ type: 'node', shape: 'circle', lag: 0 }).lagArc).toBeNull()
    expect(glyphGeometry({ type: 'node', shape: 'circle' }).lagArc).toBeNull()
  })
})

describe('arcPath', () => {
  it('starts at the top and takes the large arc past half a turn', () => {
    expect(arcPath(10, 0.25)).toBe('M 0 -10 A 10 10 0 0 1 10.00 -0.00')
    expect(arcPath(10, 0.75)).toContain('0 1 1')
  })

  it('clamps so a full turn still draws', () => {
    expect(arcPath(10, 5)).toMatch(/^M 0 -10 A 10 10 0 1 1 /)
    expect(arcPath(10, -1)).toMatch(/^M 0 -10 A 10 10 0 0 1 /)
  })
})
