import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { describeNodes } from '../src/utils/nodeFacts'
import { nodeDetailRows } from '../src/utils/nodeDetail'
import { edge, graph, mirror, node, visited } from './graphs'

const rowsFor = (url: string, nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[]) => {
  const merged = mergeGraph(graph(nodes, edges))
  return nodeDetailRows(describeNodes(merged)[url], merged)
}
const value = (rows: { label: string; value: string }[], label: string | RegExp) =>
  rows.find((r) => (typeof label === 'string' ? r.label === label : label.test(r.label)))?.value

describe('nodeDetailRows', () => {
  it('lists what a read node reported about itself', () => {
    const rows = rowsFor('http://a', [visited('http://a', { roles: ['settlement'], version: '0.1.4', shards: [{ shard_id: 's1', tree_size: 42 }] })], [])
    expect(value(rows, 'URL')).toBe('http://a')
    expect(value(rows, 'Status')).toBe('visited')
    expect(value(rows, 'Roles')).toBe('settlement')
    expect(value(rows, 'Protocol version')).toContain('0.1.4')
    expect(value(rows, 'Reports itself stale')).toBe('no')
    expect(value(rows, 'Shard s1')).toBe('tree size 42')
  })

  it('says how far behind the newest version a node is', () => {
    const rows = rowsFor('http://old', [visited('http://old', { version: '0.1.0' }), visited('http://new', { version: '0.2.0' })], [])
    expect(value(rows, 'Protocol version')).toBe('0.1.0 (behind newest 0.2.0)')
  })

  it('shows why a node could not be read, and omits fields it never reported', () => {
    const rows = rowsFor('http://dead', [visited('http://a'), node('http://dead', 'unreachable', { failure: { reason: 'timeout', message: 'no response within 10000 ms' } })], [edge('http://a', 'http://dead')])
    expect(value(rows, 'Status')).toBe('unreachable: no response within 10000 ms')
    expect(rows.some((r) => r.label === 'Roles' || r.label === 'Protocol version' || r.label === 'Reports itself stale')).toBe(false)
  })

  it('lists who reported the node', () => {
    const rows = rowsFor('http://b', [visited('http://a'), node('http://b', 'unvisited', { reportedBy: ['http://a'] })], [edge('http://a', 'http://b')])
    expect(value(rows, 'Reported by')).toBe('http://a')
  })

  it('describes each link on the node with its kinds and who measured what', () => {
    const rows = rowsFor('http://a', [visited('http://a'), visited('http://b')], [edge('http://a', 'http://b', 'active', 12.5), edge('http://b', 'http://a', 'active', 14)])
    const link = value(rows, 'Link to http://b')
    expect(link).toContain('active')
    expect(link).toContain('12.5 ms seen by http://a')
    expect(link).toContain('14.0 ms seen by http://b')
  })

  it('gives each link row a stable id so rows with repeating labels never collide', () => {
    const rows = rowsFor('http://a', [visited('http://a'), visited('http://b'), visited('http://c')], [edge('http://a', 'http://b'), edge('http://c', 'http://a')])
    const ids = rows.filter((r) => r.label.startsWith('Link to')).map((r) => r.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id?.startsWith('link:'))).toBe(true)
  })

  it('flags a link the two ends disagree about', () => {
    const rows = rowsFor('http://a', [visited('http://a'), visited('http://b')], [edge('http://a', 'http://b', 'active'), edge('http://b', 'http://a', 'known')])
    expect(value(rows, 'Link to http://b')).toContain('the two ends disagree')
  })

  it('describes what a node mirrors and how far behind it is', () => {
    const rows = rowsFor('http://a', [visited('http://a'), visited('http://s')], [mirror('http://a', 'http://s', 10, 100, 90)])
    expect(value(rows, /Mirrors http:\/\/s/)).toBe('shard s1: 90 of 100 entries, 10 behind')
  })

  it('does not list links that belong to other nodes', () => {
    const rows = rowsFor('http://a', [visited('http://a'), visited('http://b'), visited('http://c')], [edge('http://b', 'http://c')])
    expect(rows.some((r) => r.label.startsWith('Link to'))).toBe(false)
  })
})
