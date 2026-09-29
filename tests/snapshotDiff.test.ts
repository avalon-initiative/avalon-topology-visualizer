import { describe, expect, it } from 'vitest'
import { diffLabel, diffSeries, diffSnapshots, EMPTY_DIFF, hasChanges } from '../src/utils/snapshotDiff'
import { edge, graph, node, visited } from './graphs'

const g = (...nodes: ReturnType<typeof node>[]) => graph(nodes, [])

describe('diffSnapshots', () => {
  it('has nothing to compare for the first snapshot', () => {
    expect(diffSnapshots(null, g(visited('http://a')))).toEqual(EMPTY_DIFF)
  })

  it('reports joins and departures, sorted', () => {
    const before = g(visited('http://a'), visited('http://z'), visited('http://m'))
    const after = g(visited('http://a'), visited('http://y'), visited('http://b'))
    const d = diffSnapshots(before, after)
    expect(d.joined).toEqual(['http://b', 'http://y'])
    expect(d.departed).toEqual(['http://m', 'http://z'])
    expect(d.versionChanges).toEqual([])
  })

  it('reports a version change with both versions', () => {
    const d = diffSnapshots(g(visited('http://a', { version: '0.1.0' })), g(visited('http://a', { version: '0.2.0' })))
    expect(d.versionChanges).toEqual([{ url: 'http://a', from: '0.1.0', to: '0.2.0' }])
    expect(d.joined).toEqual([])
  })

  it('reports nothing for identical graphs', () => {
    const one = g(visited('http://a'), visited('http://b'))
    expect(hasChanges(diffSnapshots(one, one))).toBe(false)
  })

  it('treats a node that stopped answering as departed and one that answers again as joined', () => {
    const up = g(visited('http://a'), visited('http://b'))
    const down = g(visited('http://a'), node('http://b', 'unreachable'))
    expect(diffSnapshots(up, down).departed).toEqual(['http://b'])
    expect(diffSnapshots(down, up).joined).toEqual(['http://b'])
  })

  it('does not count a merely discovered (unvisited) node as joined', () => {
    const d = diffSnapshots(g(visited('http://a')), g(visited('http://a'), node('http://b', 'unvisited')))
    expect(d.joined).toEqual([])
  })

  it('does not report a version change when either side has no version', () => {
    const noVersion = node('http://a', 'visited')
    expect(diffSnapshots(g(noVersion), g(visited('http://a', { version: '0.2.0' }))).versionChanges).toEqual([])
    expect(diffSnapshots(g(visited('http://a', { version: '0.2.0' })), g(noVersion)).versionChanges).toEqual([])
  })

  it('does not report a version change for a node that left', () => {
    const d = diffSnapshots(g(visited('http://a', { version: '0.1.0' })), g(visited('http://b', { version: '0.2.0' })))
    expect(d.versionChanges).toEqual([])
    expect(d.departed).toEqual(['http://a'])
    expect(d.joined).toEqual(['http://b'])
  })

  it('ignores links, only nodes count', () => {
    const nodes = [visited('http://a'), visited('http://b')]
    expect(hasChanges(diffSnapshots(graph(nodes, []), graph(nodes, [edge('http://a', 'http://b', 'active', 5)])))).toBe(false)
  })

  it('handles empty graphs', () => {
    expect(hasChanges(diffSnapshots(g(), g()))).toBe(false)
    expect(diffSnapshots(g(), g(visited('http://a'))).joined).toEqual(['http://a'])
  })
})

describe('diffLabel and diffSeries', () => {
  it('summarises counts as text and is empty for no change', () => {
    expect(diffLabel({ joined: ['a', 'b'], departed: ['c'], versionChanges: [{ url: 'd', from: '1', to: '2' }] })).toBe('+2 -1 ~1')
    expect(diffLabel({ joined: [], departed: ['c'], versionChanges: [] })).toBe('-1')
    expect(diffLabel(EMPTY_DIFF)).toBe('')
  })

  it('diffs each snapshot against the one before, the first against nothing', () => {
    const series = diffSeries([g(visited('http://a')), g(visited('http://a'), visited('http://b')), g(visited('http://b'))])
    expect(series).toHaveLength(3)
    expect(series[0]).toEqual(EMPTY_DIFF)
    expect(series[1].joined).toEqual(['http://b'])
    expect(series[2].departed).toEqual(['http://a'])
    expect(diffSeries([])).toEqual([])
  })
})
