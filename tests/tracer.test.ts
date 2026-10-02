import { describe, expect, it, vi } from 'vitest'
import { joinLegs, normalizeTrace, runItinerary, runTrace, TraceInputError } from '../src/api/tracer'
import { path, trace } from './traces'

describe('runTrace', () => {
  const fn = (result = trace(path(['http://a/', 1, 2], ['HTTP://B:80', 1]))) => vi.fn(async () => result) as never

  it('sends the normalized entry and target with a clamped ttl through the SDK', async () => {
    const traceFn = fn()
    await runTrace({ entry: ' http://entry:8080/ ', target: 'http://t/', ttl: 99, traceFn })
    expect(traceFn).toHaveBeenCalledWith('http://entry:8080', 'http://t', { ttl: 16 })
  })

  it('defaults the ttl and never goes below 1', async () => {
    const traceFn = fn()
    await runTrace({ entry: 'http://e', target: 'http://t', traceFn })
    expect(traceFn).toHaveBeenLastCalledWith('http://e', 'http://t', { ttl: 12 })
    await runTrace({ entry: 'http://e', target: 'http://t', ttl: 0, traceFn })
    expect(traceFn).toHaveBeenLastCalledWith('http://e', 'http://t', { ttl: 1 })
  })

  it('rejects a bad entry or target without sending', async () => {
    const traceFn = fn()
    await expect(runTrace({ entry: 'nope', target: 'http://t', traceFn })).rejects.toBeInstanceOf(TraceInputError)
    await expect(runTrace({ entry: 'http://e', target: '', traceFn })).rejects.toThrow(/target/)
    await expect(runTrace({ entry: 'ftp://e', target: 'http://t', traceFn })).rejects.toThrow(/entry/)
    expect(traceFn).not.toHaveBeenCalled()
  })

  it('normalizes returned hop URLs so they match graph nodes, and leaves the rest untouched', async () => {
    const r = await runTrace({ entry: 'http://e', target: 'http://b', traceFn: fn() })
    expect(r.hops.map((h) => h.base_url)).toEqual(['http://a', 'http://b'])
    expect(r.hops[0].processing_ms).toBe(1)
  })

  it('keeps an unparseable hop URL as returned', () => {
    expect(normalizeTrace(trace(path(['not a url', 1]))).hops[0].base_url).toBe('not a url')
  })

  it('lets a failed request propagate', async () => {
    await expect(runTrace({ entry: 'http://e', target: 'http://t', traceFn: vi.fn().mockRejectedValue(new Error('HTTP 429')) as never })).rejects.toThrow('429')
  })
})

describe('joinLegs', () => {
  it('makes the node where one leg ends and the next begins a single hop carrying both times', () => {
    const joined = joinLegs([
      trace(path(['http://a', 1, 10], ['http://b', 2]), { total_ms: 13 }),
      trace(path(['http://b', 3, 20], ['http://c', 4]), { total_ms: 27 }),
    ])
    expect(joined.hops.map((h) => h.base_url)).toEqual(['http://a', 'http://b', 'http://c'])
    expect(joined.hops.map((h) => h.index)).toEqual([0, 1, 2])
    expect(joined.hops[1].processing_ms).toBe(5)
    expect(joined.hops[1].to_next_ms).toBe(20)
    expect(joined.total_ms).toBe(40)
    expect(joined.target).toBe('http://c')
    expect(joined.reached).toBe(true)
  })

  it('is not reached when any leg was not, and reports that leg\'s reason', () => {
    const joined = joinLegs([trace(path(['http://a', 1, 5], ['http://b', 1])), trace(path(['http://b', 1]), { reached: false, stopped_reason: 'no_route', target: 'http://c' })])
    expect(joined.reached).toBe(false)
    expect(joined.stopped_reason).toBe('no_route')
  })
})

describe('runItinerary', () => {
  const legsFn = () =>
    vi.fn(async (from: string, to: string) => trace(path([from, 1, 4], [to, 1]), { target: to, total_ms: 6 })) as never

  it('asks each leg\'s own start node for its leg, in order, and joins them', async () => {
    const traceFn = legsFn()
    const r = await runItinerary({ stops: ['http://a', 'http://b', 'http://c', 'http://a'], traceFn })
    expect((traceFn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['http://a', 'http://b'],
      ['http://b', 'http://c'],
      ['http://c', 'http://a'],
    ])
    expect(r.hops.map((h) => h.base_url)).toEqual(['http://a', 'http://b', 'http://c', 'http://a'])
    expect(r.total_ms).toBe(18)
    expect(r.reached).toBe(true)
  })

  it('stops at the first leg that does not arrive', async () => {
    const traceFn = vi.fn(async (from: string, to: string) => trace(path([from, 1]), { reached: false, stopped_reason: 'no_route', target: to })) as never
    const r = await runItinerary({ stops: ['http://a', 'http://b', 'http://c'], traceFn })
    expect(traceFn).toHaveBeenCalledTimes(1)
    expect(r.reached).toBe(false)
  })

  it('rejects too few stops, a bad URL, or the same node twice in a row, without sending', async () => {
    const traceFn = legsFn()
    await expect(runItinerary({ stops: ['http://a'], traceFn })).rejects.toBeInstanceOf(TraceInputError)
    await expect(runItinerary({ stops: ['http://a', 'nope'], traceFn })).rejects.toBeInstanceOf(TraceInputError)
    await expect(runItinerary({ stops: ['http://a', 'http://a/'], traceFn })).rejects.toThrow(/same node/)
    expect(traceFn).not.toHaveBeenCalled()
  })
})
