import { describe, expect, it } from 'vitest'
import { createSnapshot, parseSnapshot, serializeSnapshot, SnapshotError } from '../src/utils/snapshot'
import { edge, graph, node } from './graphs'

const sample = () => graph([node('http://a'), node('http://b', 'unreachable', { failure: { reason: 'network', message: 'x' } })], [edge('http://a', 'http://b', 'active', 9)])

describe('snapshot', () => {
  it('round-trips the exact graph a walk produces', () => {
    const g = sample()
    const parsed = parseSnapshot(serializeSnapshot(createSnapshot(g, new Date('2026-09-28T12:00:00Z'))))
    expect(parsed.graph).toEqual(g)
    expect(parsed.takenAt).toBe('2026-09-28T12:00:00.000Z')
  })

  const rejects = (mutate: (s: Record<string, unknown>) => void, message: RegExp) => {
    const s = JSON.parse(serializeSnapshot(createSnapshot(sample())))
    mutate(s)
    expect(() => parseSnapshot(JSON.stringify(s))).toThrow(message)
  }

  it('rejects input that is not a snapshot, with a reason', () => {
    expect(() => parseSnapshot('not json')).toThrow(SnapshotError)
    expect(() => parseSnapshot('[]')).toThrow(/unrecognized format/)
    rejects((s) => (s.version = 2), /unsupported version 2/)
    rejects((s) => (s.takenAt = 'yesterday'), /takenAt/)
    rejects((s) => delete (s.graph as Record<string, unknown>).edges, /incomplete/)
    rejects((s) => delete (s.graph as Record<string, unknown>).truncated, /truncated/)
    rejects((s) => ((s.graph as { nodes: unknown[] }).nodes[0] = { url: 'http://a', status: 'weird', reportedBy: [] }), /node is malformed/)
    rejects((s) => ((s.graph as { edges: { to: string }[] }).edges[0].to = 'http://ghost'), /edge is malformed/)
  })
})
