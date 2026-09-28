import { describe, expect, it } from 'vitest'
import { shapeForRoles, shapePoints, ROLE_LABELS } from '../src/utils/shapes'
import type { NodeShape } from '../src/utils/shapes'

describe('shapeForRoles', () => {
  it.each([
    [['settlement'], 'square'],
    [['indexer'], 'diamond'],
    [['realtime'], 'triangle'],
    [['gateway'], 'hexagon'],
    [['Settlement'], 'square'],
    [['combined'], 'circle'],
    [[], 'circle'],
    [['settlement', 'indexer'], 'circle'],
    [['something-new'], 'circle'],
  ])('maps %j to %s', (roles, expected) => {
    expect(shapeForRoles(roles as string[])).toBe(expected)
  })
})

describe('shapePoints', () => {
  it.each([
    ['square', 4],
    ['diamond', 4],
    ['triangle', 3],
    ['hexagon', 6],
    ['circle', 0],
  ] as [NodeShape, number][])('%s has %s vertices', (shape, count) => {
    expect(shapePoints(shape, 10)).toHaveLength(count)
  })

  it('keeps every vertex within about a radius of the centre', () => {
    for (const shape of ['square', 'diamond', 'triangle', 'hexagon'] as NodeShape[]) {
      for (const p of shapePoints(shape, 10)) expect(Math.hypot(p.x, p.y)).toBeLessThan(15)
    }
  })

  it('makes every shape distinguishable by vertex count or orientation', () => {
    const signature = (s: NodeShape) => JSON.stringify(shapePoints(s, 10).map((p) => [Math.round(p.x), Math.round(p.y)]))
    const sigs = new Set((['square', 'diamond', 'triangle', 'hexagon'] as NodeShape[]).map(signature))
    expect(sigs.size).toBe(4)
  })

  it('labels every shape in words', () => {
    for (const shape of ['circle', 'square', 'diamond', 'triangle', 'hexagon'] as NodeShape[]) expect(ROLE_LABELS[shape].length).toBeGreaterThan(3)
  })
})
