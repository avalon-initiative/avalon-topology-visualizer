import { describe, expect, it, vi } from 'vitest'
import { normalizeTrace, runTrace, TraceInputError } from '../src/api/tracer'
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
