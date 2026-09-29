import { NotFoundError, RateLimitedError } from '@avalon-initiative/protocol-sdk'
import type { ProbeResult } from '@avalon-initiative/protocol-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useProbe } from '../src/composables/useProbe'
import { mergeGraph } from '../src/utils/mergeGraph'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { edge, graph, visited } from './graphs'

const A = 'http://a'
const B = 'http://b'
const C = 'http://c'
const net = (...urls: string[]): MergedGraph =>
  mergeGraph(graph(urls.map((u) => visited(u)), urls.length > 1 ? [edge(urls[0], urls[1]), edge(urls[1], urls[0])] : []))
const reply = (ms: number): ProbeResult => ({ ok: true, samples_ms: [ms], target: '', median_ms: ms, min_ms: ms })

function make(probe: (...a: never[]) => Promise<ProbeResult>, initial: MergedGraph | null = net(A, B, C), extra: { rng?: () => number } = {}) {
  const merged = ref<MergedGraph | null>(initial)
  const selected = ref<string | undefined>()
  let t = 1_000_000
  const clock = () => t
  const api = effectScope().run(() => useProbe(merged, () => selected.value, { probe: probe as never, clock, ...extra }))!
  return { merged, selected, api, advance: (ms: number) => (t += ms) }
}

describe('useProbe', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cannot measure until two different nodes are picked', () => {
    const { api, selected } = make(vi.fn())
    expect(api.canProbe.value).toBe(false)
    selected.value = A
    api.pickFirst()
    expect(api.from.value).toBe(A)
    expect(api.canProbe.value).toBe(false)
    api.pickSecond()
    expect(api.from.value).toBeUndefined()
    expect(api.to.value).toBe(A)
  })

  it('does nothing when picking with no selection', () => {
    const { api } = make(vi.fn())
    api.pickFirst()
    api.pickSecond()
    expect(api.from.value).toBeUndefined()
    expect(api.to.value).toBeUndefined()
  })

  it('asks the first node to probe the second and exposes the measured link', async () => {
    const probe = vi.fn().mockResolvedValue(reply(21))
    const { api, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    expect(api.canProbe.value).toBe(true)
    await api.measure()
    expect(probe).toHaveBeenCalledWith(A, B, expect.any(Number))
    expect(api.links.value).toEqual([{ a: A, b: B, rttMs: 21 }])
    expect(api.drawLinks.value).toEqual([{ a: A, b: B, label: '21 ms by a' }])
    expect(api.last.value).toMatchObject({ ok: true, ms: 21 })
    expect(api.message.value).toBe('')
    expect(api.busy.value).toBe(false)
  })

  it('refuses a second probe while one is running', async () => {
    let release: (r: ProbeResult) => void = () => undefined
    const probe = vi.fn(() => new Promise<ProbeResult>((r) => (release = r)))
    const { api, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    const first = api.measure()
    expect(api.busy.value).toBe(true)
    expect(api.canProbe.value).toBe(false)
    expect(api.canRandom.value).toBe(false)
    await api.measure()
    await api.measureRandom()
    expect(probe).toHaveBeenCalledTimes(1)
    release(reply(3))
    await first
    expect(api.busy.value).toBe(false)
  })

  it('explains an unknown target and keeps the earlier measurements', async () => {
    const probe = vi.fn().mockResolvedValueOnce(reply(9)).mockRejectedValueOnce(new NotFoundError('unknown_target'))
    const { api, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    await api.measure()
    selected.value = C
    api.pickSecond()
    await api.measure()
    expect(api.message.value).toMatch(/peer table/)
    expect(api.links.value).toHaveLength(1)
    expect(api.cooldown.value).toBe(0)
    expect(api.canProbe.value).toBe(true)
  })

  it('explains a timeout reported by the node', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: false, error: 'timeout', samples_ms: [], target: B })
    const { api, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    await api.measure()
    expect(api.message.value).toMatch(/no answer .* in time/)
    expect(api.links.value).toEqual([])
  })

  it('explains a request that never returns', async () => {
    const probe = vi.fn(() => new Promise<ProbeResult>(() => undefined))
    const { api, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    const run = api.measure()
    await vi.advanceTimersByTimeAsync(20_000)
    await run
    expect(api.message.value).toMatch(/did not answer the probe request/)
    expect(api.busy.value).toBe(false)
  })

  describe('rate limit', () => {
    async function limited(seconds: number | undefined) {
      const err = new RateLimitedError('slow')
      err.retryAfterSeconds = seconds
      const probe = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(reply(5))
      const s = make(probe)
      s.selected.value = A
      s.api.pickFirst()
      s.selected.value = B
      s.api.pickSecond()
      await s.api.measure()
      return { ...s, probe }
    }

    it('disables the action and counts down Retry-After', async () => {
      const { api, advance, probe } = await limited(3)
      expect(api.message.value).toContain('3 s')
      expect(api.cooldown.value).toBe(3)
      expect(api.canProbe.value).toBe(false)
      await api.measure()
      expect(probe).toHaveBeenCalledTimes(1)
      advance(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(api.cooldown.value).toBe(2)
      advance(2000)
      await vi.advanceTimersByTimeAsync(2000)
      expect(api.cooldown.value).toBe(0)
      expect(api.canProbe.value).toBe(true)
      await api.measure()
      expect(probe).toHaveBeenCalledTimes(2)
    })

    it('stops its timer once the wait is over', async () => {
      const { advance } = await limited(1)
      advance(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('still pauses briefly when the node sent no Retry-After', async () => {
      const { api } = await limited(undefined)
      expect(api.cooldown.value).toBeGreaterThan(0)
      expect(api.message.value).not.toMatch(/undefined|NaN/)
    })

    it('only blocks the node that limited, and the random pick avoids it', async () => {
      const { api, probe, selected } = await limited(60)
      selected.value = B
      api.pickFirst()
      selected.value = C
      api.pickSecond()
      expect(api.canProbe.value).toBe(true)
      await api.measureRandom()
      expect(probe.mock.calls[1][0]).not.toBe(A)
    })

    it('a probe after the wait clears the message', async () => {
      const { api, advance } = await limited(1)
      advance(1000)
      await vi.advanceTimersByTimeAsync(1000)
      await api.measure()
      expect(api.message.value).toBe('')
    })
  })

  describe('random neighbor pair', () => {
    it('picks a linked pair, shows it as the two picks and probes it', async () => {
      const probe = vi.fn().mockResolvedValue(reply(4))
      const { api } = make(probe, net(A, B), { rng: () => 0.9 })
      await api.measureRandom()
      expect([api.from.value, api.to.value]).toEqual([B, A])
      expect(probe).toHaveBeenCalledWith(B, A, expect.any(Number))
    })

    it('is unavailable without any linked pair', async () => {
      const probe = vi.fn()
      const { api, merged } = make(probe, net(A))
      expect(api.canRandom.value).toBe(false)
      await api.measureRandom()
      merged.value = null
      await api.measureRandom()
      expect(probe).not.toHaveBeenCalled()
    })
  })

  it('forgets picks, outcomes and links for nodes a refresh dropped', async () => {
    const probe = vi.fn().mockResolvedValue(reply(4))
    const { api, merged, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    await api.measure()
    merged.value = net(A, C)
    await nextTick()
    expect(api.to.value).toBeUndefined()
    expect(api.from.value).toBe(A)
    expect(api.last.value).toBeNull()
    expect(api.links.value).toEqual([])
  })

  it('ignores an answer that arrives after the graph was cleared', async () => {
    let release: (r: ProbeResult) => void = () => undefined
    const probe = vi.fn(() => new Promise<ProbeResult>((r) => (release = r)))
    const { api, merged, selected } = make(probe)
    selected.value = A
    api.pickFirst()
    selected.value = B
    api.pickSecond()
    const run = api.measure()
    merged.value = null
    await nextTick()
    expect(api.busy.value).toBe(false)
    release(reply(4))
    await run
    expect(api.last.value).toBeNull()
    expect(api.links.value).toEqual([])
  })
})
