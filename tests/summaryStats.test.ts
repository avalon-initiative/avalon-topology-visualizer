import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { summaryStats } from '../src/utils/summaryStats'
import { edge, graph, node } from './graphs'

describe('summaryStats', () => {
  it('counts visited, not reached, links, disputed links and groups', () => {
    const merged = mergeGraph(
      graph(
        [node('http://a'), node('http://b'), node('http://c', 'unreachable', { failure: { reason: 'timeout', message: 'x' } }), node('http://d', 'unreachable', { failure: { reason: 'rate_limited', status: 429, message: 'y' } })],
        [edge('http://a', 'http://b', 'active', 5)],
      ),
    )
    const stats = Object.fromEntries(summaryStats(merged).map((s) => [s.label, s.value]))
    expect(stats['Nodes visited']).toBe(2)
    expect(stats['Not reached']).toBe(2)
    expect(stats['Links']).toBe(1)
    expect(stats['Disputed links']).toBe(merged.disagreements)
    expect(stats['Groups']).toBe(merged.components.length)
  })

  it('explains every stat in a hint', () => {
    for (const s of summaryStats(mergeGraph(graph([node('http://a')], [])))) expect(s.hint.length).toBeGreaterThan(5)
  })
})
