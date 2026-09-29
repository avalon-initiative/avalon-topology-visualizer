import { NotFoundError, RateLimitedError } from '@avalon-initiative/protocol-sdk'
import type { ProbeResult } from '@avalon-initiative/protocol-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROBE_SAMPLES, probePair } from '../src/api/prober'

const ok: ProbeResult = { ok: true, samples_ms: [9, 8, 8.5], target: 'http://b', median_ms: 8.5, min_ms: 8 }

describe('probePair', () => {
  it('asks the first node to probe the second with the sample count', async () => {
    const probe = vi.fn().mockResolvedValue(ok)
    const out = await probePair('http://a', 'http://b', { probe })
    expect(probe).toHaveBeenCalledWith('http://a', 'http://b', PROBE_SAMPLES)
    expect(out).toMatchObject({ ok: true, from: 'http://a', to: 'http://b', ms: 8.5 })
  })

  it('never throws: SDK errors come back as outcomes', async () => {
    const limited = new RateLimitedError('slow')
    limited.retryAfterSeconds = 12
    expect(await probePair('http://a', 'http://b', { probe: vi.fn().mockRejectedValue(limited) })).toMatchObject({ ok: false, kind: 'rate_limited', retryAfterSeconds: 12 })
    expect(await probePair('http://a', 'http://b', { probe: vi.fn().mockRejectedValue(new NotFoundError('unknown_target')) })).toMatchObject({ kind: 'unknown_target' })
    expect(await probePair('http://a', 'http://b', { probe: vi.fn().mockRejectedValue(new Error('x')) })).toMatchObject({ kind: 'error' })
  })

  it('reports a node-side timeout from the response body', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: false, error: 'timeout', samples_ms: [], target: 'http://b' })
    expect(await probePair('http://a', 'http://b', { probe })).toMatchObject({ ok: false, kind: 'timeout' })
  })

  describe('when the first node never answers', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('gives up after the timeout', async () => {
      const probe = vi.fn(() => new Promise<ProbeResult>(() => undefined))
      const pending = probePair('http://a', 'http://b', { probe, timeoutMs: 500 })
      await vi.advanceTimersByTimeAsync(499)
      let settled = false
      void pending.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toMatchObject({ ok: false, kind: 'client_timeout' })
    })

    it('leaves no timer behind after a fast answer', async () => {
      await probePair('http://a', 'http://b', { probe: vi.fn().mockResolvedValue(ok) })
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
