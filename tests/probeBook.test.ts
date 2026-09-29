import { describe, expect, it } from 'vitest'
import { liveProbes, probeDrawLinks, probeLayoutLinks, recordProbe } from '../src/utils/probeBook'
import type { ProbeSuccess } from '../src/utils/probeOutcome'

const p = (from: string, to: string, ms: number): ProbeSuccess => ({ ok: true, from, to, ms, samplesMs: [ms] })

describe('probe book', () => {
  it('keeps the latest measurement per pair whichever end took it', () => {
    let book = recordProbe({}, p('http://a', 'http://b', 10))
    book = recordProbe(book, p('http://b', 'http://a', 30))
    book = recordProbe(book, p('http://a', 'http://c', 5))
    expect(Object.values(book).map((x) => [x.from, x.to, x.ms])).toEqual([
      ['http://b', 'http://a', 30],
      ['http://a', 'http://c', 5],
    ])
  })

  it('does not mutate the earlier book', () => {
    const first = recordProbe({}, p('http://a', 'http://b', 10))
    recordProbe(first, p('http://a', 'http://c', 5))
    expect(Object.keys(first)).toHaveLength(1)
  })

  it('drops measurements whose ends left the graph', () => {
    const book = recordProbe(recordProbe({}, p('http://a', 'http://b', 10)), p('http://a', 'http://c', 5))
    expect(liveProbes(book, ['http://a', 'http://b']).map((x) => x.to)).toEqual(['http://b'])
  })

  it('feeds the layout the measured value as a round trip', () => {
    expect(probeLayoutLinks([p('http://a', 'http://b', 12)])).toEqual([{ a: 'http://a', b: 'http://b', rttMs: 12 }])
  })

  it('labels the drawn link with the value and the measuring node', () => {
    expect(probeDrawLinks([p('http://a:1', 'http://b:2', 12.34)])).toEqual([{ a: 'http://a:1', b: 'http://b:2', label: '12 ms by a:1' }])
  })
})
