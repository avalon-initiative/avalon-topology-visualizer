import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { describeNodes } from '../src/utils/nodeFacts'
import { convexHull, memberShards, SHARD_PALETTE_SIZE, shardKey, shardRegions } from '../src/utils/shardGroups'
import { graph, mirror, visited } from './graphs'

const shard = (id: string) => ({ shard_id: id, tree_size: 1 })
const factsOf = (nodes: ReturnType<typeof visited>[]) => describeNodes(mergeGraph(graph(nodes, [])))

describe('shardKey', () => {
  it('lists each shard once, in id order, so colours do not depend on crawl order', () => {
    const a = shardKey(factsOf([visited('http://a', { shards: [shard('zz'), shard('aa')] }), visited('http://b', { shards: [shard('aa')] })]))
    const b = shardKey(factsOf([visited('http://b', { shards: [shard('aa')] }), visited('http://a', { shards: [shard('aa'), shard('zz')] })]))
    expect(a.map((k) => k.id)).toEqual(['aa', 'zz'])
    expect(a).toEqual(b)
    expect(a.map((k) => k.color)).toEqual([0, 1])
  })

  it('counts a mirrored shard as a membership, alongside the node\'s own', () => {
    const merged = mergeGraph(graph([visited('http://a', { shards: [shard('own')] }), visited('http://src')], [mirror('http://a', 'http://src', 0)]))
    const facts = describeNodes(merged)
    expect(memberShards(facts['http://a'])).toEqual(['own', 's1'])
    expect(memberShards(facts['http://src'])).toEqual([])
    expect(shardKey(facts).map((k) => k.id)).toEqual(['own', 's1'])
  })

  it('is empty when no node reports a shard', () => {
    expect(shardKey(factsOf([visited('http://a')]))).toEqual([])
  })

  it('reuses colours once the palette runs out', () => {
    const ids = Array.from({ length: SHARD_PALETTE_SIZE + 1 }, (_, i) => `s${i}`)
    const key = shardKey(factsOf([visited('http://a', { shards: ids.map(shard) })]))
    expect(key[SHARD_PALETTE_SIZE].color).toBe(0)
  })
})

describe('convexHull', () => {
  it('drops interior and duplicate points', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }, { x: 0, y: 0 }])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual({ x: 5, y: 5 })
  })

  it('returns one or two points unchanged', () => {
    expect(convexHull([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }])
    expect(convexHull([{ x: 3, y: 0 }, { x: 1, y: 0 }])).toHaveLength(2)
  })

  it('keeps collinear points to their two ends', () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(2)
  })
})

describe('shardRegions', () => {
  const pos: Record<string, { x: number; y: number }> = { 'http://a': { x: 0, y: 0 }, 'http://b': { x: 40, y: 0 }, 'http://c': { x: 20, y: 30 } }
  const key = [{ id: 'x', color: 0 }, { id: 'y', color: 1 }, { id: 'none', color: 2 }]

  it('makes one region per shard around exactly its members; a node in two shards is in both', () => {
    const regions = shardRegions(key, { 'http://a': ['x'], 'http://b': ['x', 'y'], 'http://c': ['y'] }, (id) => pos[id])
    expect(regions.map((r) => [r.id, r.hull.length])).toEqual([['x', 2], ['y', 2]])
    expect(regions[0].hull).toContainEqual(pos['http://a'])
    expect(regions[1].hull).not.toContainEqual(pos['http://a'])
  })

  it('skips a shard with no drawn member', () => {
    expect(shardRegions(key, { 'http://q': ['x'] }, () => undefined)).toEqual([])
  })
})
