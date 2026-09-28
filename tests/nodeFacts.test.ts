import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { describeNodes, lagOf } from '../src/utils/nodeFacts'
import { edge, graph, mirror, node, visited } from './graphs'
import type { MirrorSource } from '@avalon-initiative/protocol-sdk'

const facts = (nodes: ReturnType<typeof visited>[], edges: ReturnType<typeof edge>[] = []) => describeNodes(mergeGraph(graph(nodes, edges)))

describe('describeNodes', () => {
  it('reads roles (lowercased), version, network, stale and shards from the self report', () => {
    const f = facts([visited('http://a', { roles: ['Settlement'], version: '0.1.4', stale: true, network_id: 'net', shards: [{ shard_id: 's1', tree_size: 42 }] })])['http://a']
    expect(f.roles).toEqual(['settlement'])
    expect(f.version).toBe('0.1.4')
    expect(f.stale).toBe(true)
    expect(f.networkId).toBe('net')
    expect(f.shards).toEqual([{ id: 's1', treeSize: 42 }])
  })

  it('marks the newest version seen, and nodes behind it', () => {
    const f = facts([visited('http://new', { version: '0.10.0' }), visited('http://old', { version: '0.9.9' }), visited('http://same', { version: '0.10.0' })])
    expect(f['http://new'].versionState).toBe('newest')
    expect(f['http://same'].versionState).toBe('newest')
    expect(f['http://old'].versionState).toBe('behind')
    expect(f['http://old'].newestVersion).toBe('0.10.0')
  })

  it('has an unknown version for a node that was never read', () => {
    const f = describeNodes(mergeGraph(graph([visited('http://a'), node('http://b', 'unreachable')], [edge('http://a', 'http://b')])))
    expect(f['http://b'].versionState).toBe('unknown')
    expect(f['http://b'].roles).toEqual([])
    expect(f['http://b'].stale).toBe(false)
  })

  it('has unknown versions when no node reported one', () => {
    const f = describeNodes(mergeGraph(graph([node('http://a', 'unvisited')], [])))
    expect(f['http://a'].versionState).toBe('unknown')
  })

  it('takes sync lag from the mirror observations the node itself made', () => {
    const f = facts([visited('http://a'), visited('http://src')], [mirror('http://a', 'http://src', 25, 100)])
    expect(f['http://a'].lagRatio).toBe(0.25)
    expect(f['http://a'].lagEntries).toBe(25)
    expect(f['http://src'].lagRatio).toBeUndefined()
  })

  it('uses the worst lag across several sources', () => {
    const f = facts([visited('http://a'), visited('http://s1'), visited('http://s2')], [mirror('http://a', 'http://s1', 5, 100), mirror('http://a', 'http://s2', 50, 100)])
    expect(f['http://a'].lagRatio).toBe(0.5)
  })

  it('reports no lag ratio when the source tree head was never observed', () => {
    const f = facts([visited('http://a'), visited('http://s')], [mirror('http://a', 'http://s', null, null)])
    expect(f['http://a'].lagRatio).toBeUndefined()
  })

  it('reports zero lag for a caught-up mirror', () => {
    const f = facts([visited('http://a'), visited('http://s')], [mirror('http://a', 'http://s', 0, 100, 100)])
    expect(f['http://a'].lagRatio).toBe(0)
  })
})

describe('lagOf', () => {
  const m = (lag: number | null, size: number | null): MirrorSource => ({ lag_entries: lag, observed_tree_size: size }) as MirrorSource

  it('is a fraction of the source tree, capped at 1', () => {
    expect(lagOf(m(10, 40))).toEqual({ entries: 10, ratio: 0.25 })
    expect(lagOf(m(500, 100))?.ratio).toBe(1)
  })

  it('is unknown without a lag, and total when behind an empty tree', () => {
    expect(lagOf(m(null, 100))).toBeUndefined()
    expect(lagOf(m(3, 0))?.ratio).toBe(1)
    expect(lagOf(m(0, 0))?.ratio).toBe(0)
  })
})
