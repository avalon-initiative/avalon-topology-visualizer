import { describe, expect, it } from 'vitest'
import { describeOutcome, SELF_REPORTED_NOTE, summarizeTrace } from '../src/utils/traceSummary'
import { hop, path, reached, stopped, trace } from './traces'

describe('summarizeTrace', () => {
  it('reports hop count, the total the node gave, and the slowest hop', () => {
    const s = summarizeTrace(reached())
    expect(s.hopCount).toBe(3)
    expect(s.totalMs).toBe(36)
    expect(s.slowest).toMatchObject({ url: 'http://a', costMs: 22 })
    expect(s.outcome).toMatchObject({ kind: 'reached', ok: true })
  })

  it('costs a hop as its processing plus the leg to the next hop', () => {
    expect(summarizeTrace(reached()).rows.map((r) => r.costMs)).toEqual([22, 13, 1])
  })

  it('takes the first of equally slow hops', () => {
    const s = summarizeTrace(trace(path(['http://a', 5], ['http://b', 5])))
    expect(s.slowest?.url).toBe('http://a')
  })

  it('has no slowest hop without hops', () => {
    const s = summarizeTrace(trace([], { reached: false, stopped_reason: 'no_route' }))
    expect(s).toMatchObject({ hopCount: 0, slowest: null, rows: [] })
  })

  it('keeps the last hop leg as null rather than zero', () => {
    expect(summarizeTrace(reached()).rows.at(-1)?.toNextMs).toBeNull()
  })

  it('does not trust negative or non-finite numbers', () => {
    const s = summarizeTrace(trace([hop('http://a', Number.NaN, -3)], { total_ms: -1 }))
    expect(s.totalMs).toBe(0)
    expect(s.rows[0]).toMatchObject({ processingMs: 0, toNextMs: 0, costMs: 0 })
  })
})

describe('describeOutcome', () => {
  it.each([
    ['ttl', /hop limit/i],
    ['no_route', /no route/i],
    ['loop', /loop/i],
    ['timeout', /timed out/i],
    ['target_unreachable', /unreachable/i],
  ] as const)('explains a %s stop', (reason, title) => {
    const o = summarizeTrace(stopped(reason)).outcome
    expect(o).toMatchObject({ kind: reason, ok: false })
    expect(o.title).toMatch(title)
    expect(o.message.length).toBeGreaterThan(20)
  })

  it('appends the detail the node gave', () => {
    expect(describeOutcome(stopped('no_route', { detail: 'peer table empty' })).message).toContain('peer table empty')
  })

  it('does not append a blank detail', () => {
    expect(describeOutcome(stopped('no_route', { detail: '  ' })).message).not.toContain('The node says')
  })

  it('falls back when stopped without a reason or with an unknown one', () => {
    expect(describeOutcome(stopped(null)).kind).toBe('incomplete')
    expect(describeOutcome(stopped('brand_new' as never)).kind).toBe('incomplete')
  })

  it('reached wins over a stray stop reason', () => {
    expect(describeOutcome({ ...reached(), stopped_reason: 'ttl' }).kind).toBe('reached')
  })
})

describe('self-reported note', () => {
  it('says the hops are reported by the nodes themselves', () => {
    expect(SELF_REPORTED_NOTE).toMatch(/reported by the node it names/)
    expect(SELF_REPORTED_NOTE).toMatch(/not verified/)
  })
})
