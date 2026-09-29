import { CapabilityNotGrantedError, NotFoundError, ProtocolError, RateLimitedError, RejectedError, UnavailableError } from '@avalon-initiative/protocol-sdk'
import type { ProbeResult } from '@avalon-initiative/protocol-sdk'
import { describe, expect, it } from 'vitest'
import { describeProbeFailure, describeProbeSuccess, interpretError, interpretProbe } from '../src/utils/probeOutcome'

const A = 'http://a:8080'
const B = 'http://b:8080'
const result = (extra: Partial<ProbeResult>): ProbeResult => ({ ok: true, samples_ms: [12, 10, 11], target: B, median_ms: 11, min_ms: 10, ...extra })

describe('interpretProbe', () => {
  it('reads the median as the measurement and keeps the samples', () => {
    expect(interpretProbe(A, B, result({}))).toEqual({ ok: true, from: A, to: B, ms: 11, samplesMs: [12, 10, 11] })
  })

  it('falls back to the minimum when there is no median', () => {
    expect(interpretProbe(A, B, result({ median_ms: null }))).toMatchObject({ ok: true, ms: 10 })
  })

  it('accepts a zero timing but not a missing, negative or non-finite one', () => {
    expect(interpretProbe(A, B, result({ median_ms: 0 }))).toMatchObject({ ok: true, ms: 0 })
    for (const bad of [{ median_ms: null, min_ms: null }, { median_ms: -1 }, { median_ms: Number.NaN }, { median_ms: Infinity }]) {
      expect(interpretProbe(A, B, result(bad))).toMatchObject({ ok: false, kind: 'error' })
    }
  })

  it.each(['timeout', 'unreachable', 'bad_status'] as const)('reports the node-side failure %s', (error) => {
    expect(interpretProbe(A, B, result({ ok: false, error, median_ms: null, min_ms: null, samples_ms: [] }))).toEqual({ ok: false, from: A, to: B, kind: error })
  })

  it('does not trust partial samples when the node says a sample failed', () => {
    expect(interpretProbe(A, B, result({ ok: false, error: 'timeout', samples_ms: [12] }))).toMatchObject({ ok: false })
  })

  it('treats an unknown failure reason as a generic error', () => {
    expect(interpretProbe(A, B, result({ ok: false, error: 'weird' }))).toMatchObject({ ok: false, kind: 'error' })
    expect(interpretProbe(A, B, result({ ok: false, error: null }))).toMatchObject({ ok: false, kind: 'error' })
  })
})

describe('interpretError', () => {
  it('maps a 404 to an unknown target', () => {
    expect(interpretError(A, B, new NotFoundError('unknown_target'))).toEqual({ ok: false, from: A, to: B, kind: 'unknown_target' })
  })

  it('carries Retry-After from a rate limit', () => {
    const e = new RateLimitedError('slow down')
    e.retryAfterSeconds = 30
    expect(interpretError(A, B, e)).toEqual({ ok: false, from: A, to: B, kind: 'rate_limited', retryAfterSeconds: 30 })
  })

  it('has no retry delay when the header was absent', () => {
    expect(interpretError(A, B, new RateLimitedError('x'))).not.toHaveProperty('retryAfterSeconds')
  })

  it('recognizes a bare 429 from a plain protocol error', () => {
    const e = new ProtocolError('x')
    e.status = 429
    e.retryAfterSeconds = 7
    expect(interpretError(A, B, e)).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 7 })
  })

  it.each([
    [new CapabilityNotGrantedError('outbound'), 'refused'],
    [new RejectedError('bad samples'), 'invalid'],
    [new UnavailableError('down'), 'node_unavailable'],
    [new ProtocolError('garbled'), 'error'],
    [new TypeError('boom'), 'error'],
    ['a string', 'error'],
  ])('maps %s to %s', (err, kind) => {
    expect(interpretError(A, B, err)).toMatchObject({ ok: false, kind })
  })
})

describe('messages', () => {
  const failure = (kind: Parameters<typeof describeProbeFailure>[0]['kind'], retryAfterSeconds?: number) => describeProbeFailure({ ok: false, from: A, to: B, kind, retryAfterSeconds })

  it('names the nodes and explains an unknown target', () => {
    const m = failure('unknown_target')
    expect(m).toContain('a:8080')
    expect(m).toContain('b:8080')
    expect(m).toMatch(/peer table/)
  })

  it('states the wait for a rate limit, and stays sensible without one', () => {
    expect(failure('rate_limited', 30)).toContain('30 s')
    expect(failure('rate_limited')).not.toMatch(/undefined|NaN/)
  })

  it('has a distinct message for every failure kind', () => {
    const kinds = ['unknown_target', 'rate_limited', 'timeout', 'unreachable', 'bad_status', 'refused', 'invalid', 'node_unavailable', 'client_timeout', 'error'] as const
    const messages = kinds.map((k) => failure(k))
    expect(new Set(messages).size).toBe(kinds.length)
    expect(failure('timeout')).toMatch(/no answer .* in time/)
    expect(failure('client_timeout')).toMatch(/did not answer/)
  })

  it('states which node measured a value', () => {
    const line = describeProbeSuccess({ ok: true, from: A, to: B, ms: 12.34, samplesMs: [] })
    expect(line).toBe('12 ms between a:8080 and b:8080, measured by a:8080')
  })
})
