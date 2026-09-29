import { describe, expect, it } from 'vitest'
import { applyVisibility } from '../src/utils/filterGraph'
import { filterOptions, filtersActive, NO_FILTERS, toggleValue, visibleNodes } from '../src/utils/filters'
import type { Filters } from '../src/utils/filters'
import { linkStyles, nodeStyle } from '../src/utils/styleGraph'
import { edge, factsOf, merged, node, reporting, shard } from './extraGraphs'

const nodes = [
  reporting('http://gw.one:1', { roles: ['gateway'], version: '0.1.0', network: 'net-a', shards: [shard('s1', 3)] }),
  reporting('http://gw.two:2', { roles: ['gateway', 'witness'], version: '0.2.0', network: 'net-a', shards: [shard('s2', 3)] }),
  reporting('http://hoster:3', { roles: ['hoster'], version: '0.2.0', network: 'net-b', shards: [shard('s1', 3), shard('s2', 3)] }),
  node('http://dark:4', 'unreachable'),
]
const facts = factsOf(nodes)
const f = (patch: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...patch })
const ids = (s: Set<string> | null) => [...(s ?? [])].sort()

describe('visibleNodes', () => {
  it('filters nothing when no filter is set, including a blank search', () => {
    expect(visibleNodes(facts, NO_FILTERS)).toBeNull()
    expect(visibleNodes(facts, f({ search: '   ' }))).toBeNull()
    expect(filtersActive(f({ search: 'x' }))).toBe(true)
  })

  it('filters by each facet alone', () => {
    expect(ids(visibleNodes(facts, f({ roles: ['hoster'] })))).toEqual(['http://hoster:3'])
    expect(ids(visibleNodes(facts, f({ networkIds: ['net-b'] })))).toEqual(['http://hoster:3'])
    expect(ids(visibleNodes(facts, f({ versions: ['0.2.0'] })))).toEqual(['http://gw.two:2', 'http://hoster:3'])
    expect(ids(visibleNodes(facts, f({ shards: ['s1'] })))).toEqual(['http://gw.one:1', 'http://hoster:3'])
  })

  it('takes any chosen value within a facet (or) and every facet together (and)', () => {
    expect(ids(visibleNodes(facts, f({ roles: ['hoster', 'witness'] })))).toEqual(['http://gw.two:2', 'http://hoster:3'])
    expect(ids(visibleNodes(facts, f({ roles: ['gateway'], versions: ['0.2.0'] })))).toEqual(['http://gw.two:2'])
    expect(ids(visibleNodes(facts, f({ roles: ['gateway'], versions: ['0.2.0'], networkIds: ['net-b'] })))).toEqual([])
    expect(ids(visibleNodes(facts, f({ shards: ['s1', 's2'], networkIds: ['net-a'] })))).toEqual(['http://gw.one:1', 'http://gw.two:2'])
  })

  it('searches the URL case-insensitively and combines it with the facets', () => {
    expect(ids(visibleNodes(facts, f({ search: 'GW.' })))).toEqual(['http://gw.one:1', 'http://gw.two:2'])
    expect(ids(visibleNodes(facts, f({ search: ' gw. ', versions: ['0.1.0'] })))).toEqual(['http://gw.one:1'])
    expect(ids(visibleNodes(facts, f({ search: 'nothing-here' })))).toEqual([])
  })

  it('matches a URL whatever its letter case', () => {
    const mixed = factsOf([reporting('http://Node.Example:1')])
    expect(ids(visibleNodes(mixed, f({ search: 'node.example' })))).toEqual(['http://Node.Example:1'])
    expect(ids(visibleNodes(mixed, f({ search: 'NODE.EX' })))).toEqual(['http://Node.Example:1'])
  })

  it('never matches a node that did not report the attribute', () => {
    expect(visibleNodes(facts, f({ roles: ['gateway'] }))?.has('http://dark:4')).toBe(false)
    expect(ids(visibleNodes(facts, f({ search: 'dark' })))).toEqual(['http://dark:4'])
  })
})

describe('filterOptions and toggleValue', () => {
  it('lists each value present once, sorted', () => {
    expect(filterOptions(facts)).toEqual({ roles: ['gateway', 'hoster', 'witness'], networkIds: ['net-a', 'net-b'], versions: ['0.1.0', '0.2.0'], shards: ['s1', 's2'] })
  })

  it('has no options without nodes', () => {
    expect(filterOptions({})).toEqual({ roles: [], networkIds: [], versions: [], shards: [] })
  })

  it('toggles a value on and off without touching the other filters', () => {
    const on = toggleValue(f({ search: 'x', roles: ['a'] }), 'roles', 'b')
    expect(on).toEqual(f({ search: 'x', roles: ['a', 'b'] }))
    expect(toggleValue(on, 'roles', 'a').roles).toEqual(['b'])
  })
})

describe('applyVisibility', () => {
  const g = merged(nodes, [edge('http://gw.one:1', 'http://gw.two:2', 'active', 5), edge('http://gw.two:2', 'http://hoster:3', 'active', 9)])
  const positions = { 'http://gw.one:1': { x: 1, y: 1 }, 'http://gw.two:2': { x: 2, y: 2 }, 'http://hoster:3': { x: 3, y: 3 }, 'http://dark:4': { x: 4, y: 4 }, 'viewer:x': { x: 5, y: 5 } }
  const input = {
    positions,
    linkStyles: [...g.links.flatMap(linkStyles), { kind: 'active' as const, a: 'viewer:x', b: 'http://gw.one:1', width: 1, alpha: 1 }],
    nodeStyles: Object.fromEntries(Object.entries(facts).map(([u, x]) => [u, nodeStyle(x)])),
  }
  const known = new Set(Object.keys(facts))
  const visible = new Set(['http://gw.one:1', 'http://gw.two:2'])

  it('returns the input untouched without an active filter', () => {
    expect(applyVisibility(input, null, known, 'hide')).toBe(input)
  })

  it('hides filtered nodes and every link touching them, keeping the viewer and the visible nodes in place', () => {
    const out = applyVisibility(input, visible, known, 'hide')
    expect(Object.keys(out.positions).sort()).toEqual(['http://gw.one:1', 'http://gw.two:2', 'viewer:x'])
    expect(out.positions['http://gw.two:2']).toBe(positions['http://gw.two:2'])
    expect(out.linkStyles.map((l) => `${l.a}>${l.b}`).sort()).toEqual(['http://gw.one:1>http://gw.two:2', 'viewer:x>http://gw.one:1'])
    expect(Object.keys(out.nodeStyles)).toEqual(['http://gw.one:1', 'http://gw.two:2'])
  })

  it('dims instead: same positions, faded nodes and links that touch a filtered node', () => {
    const out = applyVisibility(input, visible, known, 'dim')
    expect(out.positions).toBe(positions)
    expect(out.nodeStyles['http://hoster:3'].faded).toBe(true)
    expect(out.nodeStyles['http://gw.one:1'].faded).toBeUndefined()
    const faded = out.linkStyles.filter((l) => l.faded).map((l) => `${l.a}>${l.b}`)
    expect(faded).toEqual(['http://gw.two:2>http://hoster:3'])
  })

  it('hides every graph node but keeps the viewer when nothing matches', () => {
    const out = applyVisibility(input, new Set(), known, 'hide')
    expect(Object.keys(out.positions)).toEqual(['viewer:x'])
    expect(out.linkStyles).toEqual([])
  })
})
