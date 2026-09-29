import { describe, expect, it } from 'vitest'
import { alertKindsByNode, deriveAlerts } from '../src/utils/alerts'
import { factsOf, finding, mirrorWith, reporting } from './extraGraphs'
import { node } from './graphs'

describe('deriveAlerts', () => {
  it('has no alerts for a healthy network', () => {
    expect(deriveAlerts(factsOf([reporting('http://a'), reporting('http://b')], [mirrorWith('http://a', 'http://b')]))).toEqual([])
  })

  it('raises one alert per open equivocation finding, on the node that reported it', () => {
    const alerts = deriveAlerts(factsOf([reporting('http://a'), reporting('http://b')], [mirrorWith('http://a', 'http://b', [finding('http://x', 'http://y', 7), finding('http://x', 'http://z', 9)])]))
    expect(alerts).toHaveLength(2)
    expect(alerts.every((a) => a.kind === 'equivocation' && a.url === 'http://a')).toBe(true)
    expect(alerts[0].detail).toContain('http://x')
    expect(alerts[0].detail).toContain('7')
    expect(new Set(alerts.map((a) => a.id)).size).toBe(2)
  })

  it('does not repeat an identical finding listed twice', () => {
    const f = finding('http://x', 'http://y', 7)
    expect(deriveAlerts(factsOf([reporting('http://a'), reporting('http://b')], [mirrorWith('http://a', 'http://b', [f, f])]))).toHaveLength(1)
  })

  it('raises a stale alert for a visited node that reports itself stale', () => {
    const alerts = deriveAlerts(factsOf([reporting('http://a', { stale: true }), reporting('http://b')]))
    expect(alerts).toEqual([expect.objectContaining({ kind: 'stale', url: 'http://a', id: 'stale|http://a' })])
  })

  it('never calls an unread node stale', () => {
    expect(deriveAlerts(factsOf([node('http://a', 'unreachable'), node('http://b', 'unvisited')]))).toEqual([])
  })

  it('lists equivocations before stale nodes, then by URL', () => {
    const alerts = deriveAlerts(
      factsOf([reporting('http://c', { stale: true }), reporting('http://a', { stale: true }), reporting('http://b'), reporting('http://d')], [mirrorWith('http://d', 'http://b', [finding('x', 'y', 1)])]),
    )
    expect(alerts.map((a) => `${a.kind}:${a.url}`)).toEqual(['equivocation:http://d', 'stale:http://a', 'stale:http://c'])
  })

  it('keeps the ids stable between two derivations of the same facts', () => {
    const f = factsOf([reporting('http://a', { stale: true }), reporting('http://b')], [mirrorWith('http://a', 'http://b', [finding('x', 'y', 1)])])
    expect(deriveAlerts(f).map((a) => a.id)).toEqual(deriveAlerts(f).map((a) => a.id))
  })
})

describe('alertKindsByNode', () => {
  it('groups kinds per node without repeating one', () => {
    const alerts = deriveAlerts(factsOf([reporting('http://a', { stale: true }), reporting('http://b')], [mirrorWith('http://a', 'http://b', [finding('x', 'y', 1), finding('x', 'y', 2)])]))
    expect(alertKindsByNode(alerts)).toEqual({ 'http://a': ['equivocation', 'stale'] })
  })

  it('is empty without alerts', () => {
    expect(alertKindsByNode([])).toEqual({})
  })
})
