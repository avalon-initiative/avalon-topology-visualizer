import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProber } from '../src/api/rttProber'
import type { RttSample } from '../src/api/rttProber'

type Init = RequestInit & { signal: AbortSignal }
const respond = (status = 200, headers: Record<string, string> = {}) => new Response(null, { status, headers })

/** A fetch that answers after `delayMs`, rejects on abort, and records every call. */
function fakeFetch(handler: (url: string) => { status?: number; headers?: Record<string, string>; delayMs?: number; error?: boolean } = () => ({})) {
  const calls: { url: string; init: Init }[] = []
  let inFlight = 0
  let peak = 0
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const signal = (init as Init).signal
    calls.push({ url, init: init as Init })
    const plan = handler(url)
    inFlight++
    peak = Math.max(peak, inFlight)
    return new Promise<Response>((resolve, reject) => {
      const done = () => {
        inFlight--
      }
      signal.addEventListener('abort', () => {
        done()
        reject(new DOMException('aborted', 'AbortError'))
      })
      if (plan.delayMs === Infinity) return
      setTimeout(() => {
        if (signal.aborted) return
        done()
        if (plan.error) reject(new TypeError('Failed to fetch'))
        else resolve(respond(plan.status ?? 200, plan.headers))
      }, plan.delayMs ?? 5)
    })
  })
  return { fn: fn as unknown as typeof fetch, calls, peak: () => peak }
}

function setup({ urls, ...opts }: Partial<Omit<Parameters<typeof createProber>[0], 'urls'>> & { urls?: string[] } = {}) {
  const samples: RttSample[] = []
  const rounds = vi.fn()
  const urlList = urls ?? ['http://a', 'http://b']
  const prober = createProber({ intervalMs: 1000, timeoutMs: 200, urls: () => urlList, onSample: (s) => samples.push(s), onRound: rounds, ...opts })
  return { prober, samples, rounds, urlList }
}

describe('createProber', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('times a credential-less, cache-free, cross-origin GET to the status route', async () => {
    const f = fakeFetch()
    const { prober, samples } = setup({ fetchFn: f.fn, urls: ['http://a:8080/base/path'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe('http://a:8080/nodes/status')
    expect(f.calls[0].init).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' })
    expect(f.calls[0].init.headers).toBeUndefined()
    expect(samples[0].rttMs).toBeGreaterThanOrEqual(4)
    expect(samples[0].rttMs).toBeLessThan(200)
    prober.stop()
  })

  it('records a timeout as loss and aborts the request', async () => {
    const f = fakeFetch(() => ({ delayMs: Infinity }))
    const { prober, samples } = setup({ fetchFn: f.fn, urls: ['http://a'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(199)
    expect(samples).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(samples).toEqual([{ url: 'http://a', rttMs: null, reason: 'timeout' }])
    expect(f.calls[0].init.signal.aborted).toBe(true)
    prober.stop()
  })

  it('records network errors and HTTP errors as loss, not as a time', async () => {
    const f = fakeFetch((url) => (url.includes('down') ? { error: true } : { status: 503 }))
    const { prober, samples } = setup({ fetchFn: f.fn, urls: ['http://down', 'http://sick'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(20)
    expect(samples.map((s) => [s.url, s.rttMs, s.reason])).toEqual([
      ['http://down', null, 'network'],
      ['http://sick', null, 'http'],
    ])
    prober.stop()
  })

  it('records a URL that is not http(s) as loss without a request', async () => {
    const f = fakeFetch()
    const { prober, samples } = setup({ fetchFn: f.fn, urls: ['ftp://x', 'nonsense'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(5)
    expect(f.fn).not.toHaveBeenCalled()
    expect(samples.map((s) => s.rttMs)).toEqual([null, null])
    prober.stop()
  })

  it('stops asking a node that answered 429 for its Retry-After, then resumes', async () => {
    let limited = true
    const f = fakeFetch((url) => (url === 'http://busy/nodes/status' || url.startsWith('http://busy') ? (limited ? { status: 429, headers: { 'Retry-After': '5' } } : {}) : {}))
    const { prober, samples } = setup({ fetchFn: f.fn, urls: ['http://busy', 'http://fine'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(20)
    expect(samples.find((s) => s.url === 'http://busy')).toMatchObject({ rttMs: null, reason: 'rate_limited' })
    const busyCalls = () => f.calls.filter((c) => c.url.startsWith('http://busy')).length
    await vi.advanceTimersByTimeAsync(3000)
    expect(busyCalls()).toBe(1)
    expect(f.calls.filter((c) => c.url.startsWith('http://fine')).length).toBeGreaterThan(2)
    limited = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(busyCalls()).toBe(2)
    expect(samples.filter((s) => s.url === 'http://busy').at(-1)?.rttMs).not.toBeNull()
    prober.stop()
  })

  it('waits at least one interval on a 429 without Retry-After, and caps an absurd one', async () => {
    const f = fakeFetch(() => ({ status: 429, headers: { 'Retry-After': '999999' } }))
    const { prober } = setup({ fetchFn: f.fn, urls: ['http://a'] })
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(599_000)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(f.calls).toHaveLength(2)
    prober.stop()
  })

  it('backs off exponentially on repeated failure, up to a cap, and recovers on success', async () => {
    let up = false
    const f = fakeFetch(() => (up ? {} : { error: true }))
    const { prober } = setup({ fetchFn: f.fn, urls: ['http://a'], maxBackoffMs: 4000 })
    prober.start()
    // failures at t=0, 1s (gap 1s), 3s (gap 2s), 7s (gap 4s), 11s (capped at 4s)
    await vi.advanceTimersByTimeAsync(12_100)
    expect(f.calls).toHaveLength(5)
    up = true
    await vi.advanceTimersByTimeAsync(2_500)
    expect(f.calls).toHaveLength(5)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(f.calls).toHaveLength(6)
    // the success cleared the backoff, so the very next round asks again
    await vi.advanceTimersByTimeAsync(1_100)
    expect(f.calls).toHaveLength(7)
    prober.stop()
  })

  it('never exceeds the concurrency cap and still measures every node', async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `http://n${i}`)
    const f = fakeFetch(() => ({ delayMs: 20 }))
    const { prober, samples, rounds } = setup({ fetchFn: f.fn, urls, concurrency: 3 })
    prober.start()
    await vi.advanceTimersByTimeAsync(200)
    expect(f.peak()).toBe(3)
    expect(samples).toHaveLength(10)
    expect(new Set(samples.map((s) => s.url)).size).toBe(10)
    expect(rounds).toHaveBeenCalledTimes(1)
    prober.stop()
  })

  it('measures again every interval, reading the node list fresh each round', async () => {
    const f = fakeFetch()
    const urls = ['http://a']
    const { prober, rounds } = setup({ fetchFn: f.fn, urls })
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.calls).toHaveLength(1)
    urls.push('http://b')
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls.map((c) => c.url)).toEqual(['http://a/nodes/status', 'http://a/nodes/status', 'http://b/nodes/status'])
    expect(rounds).toHaveBeenCalledTimes(2)
    prober.stop()
  })

  it('does not overlap rounds when a round outlasts the interval', async () => {
    const f = fakeFetch(() => ({ delayMs: 150 }))
    const { prober } = setup({ fetchFn: f.fn, urls: ['http://a'], intervalMs: 100, timeoutMs: 1000 })
    prober.start()
    await vi.advanceTimersByTimeAsync(140)
    expect(f.peak()).toBe(1)
    await vi.advanceTimersByTimeAsync(400)
    expect(f.peak()).toBe(1)
    prober.stop()
  })

  it('stop aborts in-flight requests, reports nothing more, and stops the schedule', async () => {
    const f = fakeFetch(() => ({ delayMs: 50 }))
    const { prober, samples, rounds } = setup({ fetchFn: f.fn, urls: ['http://a'] })
    prober.start()
    expect(prober.running).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    prober.stop()
    expect(prober.running).toBe(false)
    expect(f.calls[0].init.signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.calls).toHaveLength(1)
    expect(samples).toHaveLength(0)
    expect(rounds).not.toHaveBeenCalled()
  })

  it('can be started again after a stop, and start while running does nothing extra', async () => {
    const f = fakeFetch()
    const { prober } = setup({ fetchFn: f.fn, urls: ['http://a'] })
    prober.start()
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.calls).toHaveLength(1)
    prober.stop()
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.calls).toHaveLength(2)
    prober.stop()
  })

  it('handles an empty node list', async () => {
    const f = fakeFetch()
    const { prober, rounds } = setup({ fetchFn: f.fn, urls: [] })
    prober.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(f.fn).not.toHaveBeenCalled()
    expect(rounds).toHaveBeenCalledTimes(1)
    prober.stop()
  })
})

describe('status URL', () => {
  it('probes the origin like the SDK does (path and query dropped) and refuses non-http URLs', async () => {
    const seen: string[] = []
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      seen.push(String(url))
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const samples: { url: string; rttMs: number | null }[] = []
    const prober = createProber({
      urls: () => ['https://proxy.example/avalon/', 'http://plain.example:8080', 'https://q.example/x?y=1', 'ftp://nope.example', 'not a url'],
      onSample: (s) => samples.push(s),
      fetchFn,
      intervalMs: 1_000_000,
    })
    prober.start()
    await vi.waitFor(() => expect(samples).toHaveLength(5))
    prober.stop()
    expect(seen.sort()).toEqual(['http://plain.example:8080/nodes/status', 'https://proxy.example/nodes/status', 'https://q.example/nodes/status'])
    expect(samples.filter((s) => s.rttMs === null).map((s) => s.url).sort()).toEqual(['ftp://nope.example', 'not a url'])
  })
})
