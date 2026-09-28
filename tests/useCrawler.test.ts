import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { GraphSource } from '../src/api/graphSource'
import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'
import { createSnapshot, serializeSnapshot } from '../src/utils/snapshot'
import { edge, graph, node } from './graphs'

const { liveWalkSource } = vi.hoisted(() => ({ liveWalkSource: vi.fn() }))
vi.mock('../src/api/graphSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/graphSource')>()),
  liveWalkSource,
}))

import { useCrawler } from '../src/composables/useCrawler'

const g1 = graph([node('http://seed'), node('http://b')], [edge('http://seed', 'http://b')])
const sourceReturning = (...graphs: TopologyGraph[]): GraphSource => {
  let i = 0
  return { live: true, load: async () => graphs[Math.min(i++, graphs.length - 1)] }
}

function make() {
  const scope = effectScope()
  const crawler = scope.run(() => useCrawler())!
  return { crawler, scope }
}

describe('useCrawler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    liveWalkSource.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('refuses a seed that is not an http(s) URL without walking', () => {
    const { crawler } = make()
    crawler.start('nope')
    expect(liveWalkSource).not.toHaveBeenCalled()
    expect(crawler.phase.value).toBe('failed')
    expect(crawler.error.value).toMatch(/http\(s\)/)
  })

  it('walks from the normalized seed and exposes the merged graph', async () => {
    liveWalkSource.mockReturnValue(sourceReturning(g1))
    const { crawler } = make()
    await crawler.start('HTTP://seed/', { maxNodes: 5 })
    expect(liveWalkSource).toHaveBeenCalledWith(['http://seed'], { maxNodes: 5 })
    expect(crawler.phase.value).toBe('ready')
    expect(crawler.merged.value?.links).toHaveLength(1)
    expect(crawler.isLive.value).toBe(true)
  })

  it('walks again after each refresh interval and replaces the graph', async () => {
    const g2 = graph([node('http://seed')], [])
    liveWalkSource.mockReturnValue(sourceReturning(g1, g2))
    const { crawler } = make()
    await crawler.start('http://seed', {}, 10_000)
    expect(crawler.graph.value).toBe(g1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(crawler.graph.value).toBe(g2)
  })

  it('does not refresh when the interval is 0', async () => {
    const source = sourceReturning(g1)
    const load = vi.spyOn(source, 'load')
    liveWalkSource.mockReturnValue(source)
    const { crawler } = make()
    await crawler.start('http://seed')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stops refreshing when stopped or when its scope ends', async () => {
    const source = sourceReturning(g1)
    const load = vi.spyOn(source, 'load')
    liveWalkSource.mockReturnValue(source)
    const { crawler, scope } = make()
    await crawler.start('http://seed', {}, 5_000)
    scope.stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(crawler.phase.value).toBe('ready')
  })

  it('keeps the last complete graph when a later walk is cancelled', async () => {
    const partial = { ...g1, nodes: [node('http://seed')], edges: [], cancelled: true }
    liveWalkSource.mockReturnValue(sourceReturning(g1, partial))
    const { crawler } = make()
    await crawler.start('http://seed', {}, 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(crawler.graph.value).toBe(g1)
  })

  it('reports a failed walk and lets the next one recover', async () => {
    const failing: GraphSource = { live: true, load: async () => { throw new Error('boom') } }
    liveWalkSource.mockReturnValueOnce(failing).mockReturnValueOnce(sourceReturning(g1))
    const { crawler } = make()
    await crawler.start('http://seed')
    expect(crawler.phase.value).toBe('failed')
    expect(crawler.error.value).toBe('boom')
    await crawler.start('http://seed')
    expect(crawler.phase.value).toBe('ready')
    expect(crawler.error.value).toBe('')
  })

  it('loads a snapshot through the same path, without walking or refreshing', async () => {
    const { crawler } = make()
    await crawler.loadSnapshot(serializeSnapshot(createSnapshot(g1, new Date('2026-01-02T03:04:05Z'))))
    expect(liveWalkSource).not.toHaveBeenCalled()
    expect(crawler.isLive.value).toBe(false)
    expect(crawler.graph.value).toEqual(g1)
    expect(crawler.takenAt.value?.toISOString()).toBe('2026-01-02T03:04:05.000Z')
  })

  it('reports a bad snapshot and keeps what was already loaded', async () => {
    liveWalkSource.mockReturnValue(sourceReturning(g1))
    const { crawler } = make()
    await crawler.start('http://seed')
    crawler.loadSnapshot('{"format":"other"}')
    expect(crawler.phase.value).toBe('failed')
    expect(crawler.error.value).toMatch(/Not a topology snapshot/)
    expect(crawler.graph.value).toBe(g1)
  })

  it('saves what it holds in the snapshot shape, and nothing before a walk', async () => {
    liveWalkSource.mockReturnValue(sourceReturning(g1))
    const { crawler } = make()
    expect(crawler.saveSnapshot()).toBeNull()
    await crawler.start('http://seed')
    expect(JSON.parse(crawler.saveSnapshot()!).graph).toEqual(g1)
  })
})
