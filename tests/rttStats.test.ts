import { describe, expect, it } from 'vitest'
import { DEFAULT_WINDOW, VIEWER_ID, pruneBook, rankReachable, recordOutcome, summarize, summarizeBook, viewerLinks } from '../src/utils/rttStats'
import type { RttBook } from '../src/utils/rttStats'

const feed = (url: string, outcomes: (number | null)[], window?: number): RttBook =>
  outcomes.reduce<RttBook>((book, o) => recordOutcome(book, url, o, window), {})

describe('summarize', () => {
  it('has nothing to report before any attempt', () => {
    expect(summarize('http://a')).toEqual({ url: 'http://a', count: 0, failures: 0, lossRatio: 0, minMs: null, smoothedMs: null, lastMs: null })
  })

  it('reports a single sample as min, smoothed and last', () => {
    const s = summarize('http://a', [42])
    expect([s.minMs, s.smoothedMs, s.lastMs, s.count, s.lossRatio]).toEqual([42, 42, 42, 1, 0])
  })

  it('keeps the minimum and the last success, and smooths with an EWMA', () => {
    const s = summarize('http://a', [100, 50, 80], 0.25)
    expect(s.minMs).toBe(50)
    expect(s.lastMs).toBe(80)
    expect(s.smoothedMs).toBeCloseTo(85.625)
  })

  it('counts failures as loss and never as a large round trip', () => {
    const s = summarize('http://a', [10, null, 20, null], 0.5)
    expect(s.failures).toBe(2)
    expect(s.lossRatio).toBe(0.5)
    expect(s.count).toBe(2)
    expect(s.minMs).toBe(10)
    expect(s.smoothedMs).toBe(15)
    expect(s.lastMs).toBe(20)
  })

  it('a node that only ever failed is total loss with no timings', () => {
    const s = summarize('http://a', [null, null, null])
    expect(s.lossRatio).toBe(1)
    expect([s.minMs, s.smoothedMs, s.lastMs, s.count]).toEqual([null, null, null, 0])
  })
})

describe('recordOutcome', () => {
  it('bounds memory to the rolling window and forgets old samples', () => {
    const book = feed('http://a', [1, 2, 3, 4, 5], 3)
    expect(book['http://a']).toEqual([3, 4, 5])
    expect(summarize('http://a', book['http://a']).minMs).toBe(3)
  })

  it('defaults to a bounded window', () => {
    const book = feed('http://a', Array.from({ length: DEFAULT_WINDOW * 3 }, (_, i) => i))
    expect(book['http://a']).toHaveLength(DEFAULT_WINDOW)
  })

  it('lets a loss age out of the window', () => {
    const book = feed('http://a', [null, 5, 5], 3)
    expect(summarize('http://a', book['http://a']).lossRatio).toBeCloseTo(1 / 3)
    expect(summarize('http://a', recordOutcome(book, 'http://a', 5, 3)['http://a']).lossRatio).toBe(0)
  })

  it('treats non-finite and negative times as loss', () => {
    const book = [Number.NaN, Infinity, -1].reduce((b, v) => recordOutcome(b, 'http://a', v), {} as RttBook)
    expect(book['http://a']).toEqual([null, null, null])
  })

  it('does not mutate the book it was given', () => {
    const before = feed('http://a', [1])
    recordOutcome(before, 'http://a', 2)
    expect(before['http://a']).toEqual([1])
  })
})

describe('pruneBook and summarizeBook', () => {
  it('drops nodes that left the graph', () => {
    const book = { ...feed('http://a', [1]), ...feed('http://b', [2]) }
    expect(Object.keys(pruneBook(book, ['http://b']))).toEqual(['http://b'])
  })

  it('summarizes every URL in order, including ones never attempted', () => {
    const out = summarizeBook(feed('http://b', [7]), ['http://a', 'http://b'])
    expect(out.map((s) => [s.url, s.count])).toEqual([['http://a', 0], ['http://b', 1]])
  })

  it('returns nothing for no nodes', () => {
    expect(summarizeBook({}, [])).toEqual([])
  })
})

describe('rankReachable', () => {
  const sum = (url: string, ms: number | null) => ({ ...summarize(url, ms === null ? [null] : [ms]) })

  it('names the fastest and slowest by smoothed value', () => {
    expect(rankReachable([sum('http://a', 30), sum('http://b', 10), sum('http://c', 90)])).toEqual({ fastest: 'http://b', slowest: 'http://c' })
  })

  it('ignores nodes with total loss', () => {
    expect(rankReachable([sum('http://a', null), sum('http://b', 10), sum('http://c', 20)])).toEqual({ fastest: 'http://b', slowest: 'http://c' })
  })

  it('does not call a lone reachable node both fastest and slowest', () => {
    expect(rankReachable([sum('http://a', null), sum('http://b', 10)])).toEqual({ fastest: 'http://b', slowest: null })
  })

  it('has no ranking when nothing is reachable or there are no nodes', () => {
    expect(rankReachable([sum('http://a', null)])).toEqual({ fastest: null, slowest: null })
    expect(rankReachable([])).toEqual({ fastest: null, slowest: null })
  })

  it('breaks ties toward the first node', () => {
    expect(rankReachable([sum('http://a', 5), sum('http://b', 5)])).toEqual({ fastest: 'http://a', slowest: 'http://a' })
  })
})

describe('viewerLinks', () => {
  it('links the viewer to each node with a success, weighted by the smoothed value', () => {
    const links = viewerLinks([summarize('http://a', [10, 30], 0.5), summarize('http://dead', [null, null]), summarize('http://new')])
    expect(links).toEqual([{ a: VIEWER_ID, b: 'http://a', rttMs: 20 }])
  })

  it('keeps a link to a node that lost some samples but still answers', () => {
    expect(viewerLinks([summarize('http://a', [null, 12])])).toHaveLength(1)
  })
})
