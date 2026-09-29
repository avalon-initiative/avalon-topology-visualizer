import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useTrace } from '../src/composables/useTrace'
import { SPEEDS } from '../src/utils/traceAnimation'
import { reached, stopped } from './traces'

/** A manual animation-frame clock so playback is driven by test time, never the wall. */
function clock() {
  let cb: ((now: number) => void) | undefined
  let now = 0
  return {
    raf: (f: (n: number) => void) => ((cb = f), 1),
    cancelRaf: () => (cb = undefined),
    step(ms: number) {
      now += ms
      const f = cb
      cb = undefined
      f?.(now)
    },
    get pending() {
      return cb !== undefined
    },
  }
}

function make(traceFn: unknown, target: string | null = 'http://c') {
  const c = clock()
  const scope = effectScope()
  const t = ref<string | undefined>(target ?? undefined)
  const api = scope.run(() => useTrace({ target: t, defaultEntry: () => 'http://seed', traceFn: traceFn as never, raf: c.raf, cancelRaf: c.cancelRaf }))!
  return { api, c, scope, target: t }
}

describe('useTrace', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('traces from the seed when the entry is empty, then plays the returned path', async () => {
    const fn = vi.fn(async () => reached())
    const { api, c } = make(fn)
    await api.trace()
    expect(fn).toHaveBeenCalledWith('http://seed', 'http://c', { ttl: 12 })
    expect(api.summary.value?.hopCount).toBe(3)
    expect(api.playback.value.status).toBe('playing')
    expect(api.drawing.value?.path).toEqual(['viewer:this-browser', 'http://a', 'http://b', 'http://c'])
    c.step(0)
    c.step(SPEEDS.normal * 8)
    expect(api.playback.value.elapsedMs).toBeCloseTo(8)
    expect(api.frame.value?.reachedOut).toEqual(['http://a'])
  })

  it('uses an entered entry node over the seed', async () => {
    const fn = vi.fn(async (..._args: unknown[]) => reached())
    const { api } = make(fn)
    api.entryInput.value = ' http://mine '
    await api.trace()
    expect(fn.mock.calls[0][0]).toBe('http://mine')
  })

  it('finishes and stops asking for frames', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    c.step(0)
    c.step(1e6)
    expect(api.playback.value.status).toBe('finished')
    expect(c.pending).toBe(false)
    expect(api.frame.value?.finished).toBe(true)
  })

  it('pauses, holds position and resumes', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    c.step(0)
    c.step(SPEEDS.normal * 3)
    api.togglePause()
    const at = api.playback.value.elapsedMs
    expect(c.pending).toBe(false)
    c.step(1000)
    expect(api.playback.value.elapsedMs).toBe(at)
    api.togglePause()
    c.step(0)
    c.step(SPEEDS.normal * 2)
    expect(api.playback.value.elapsedMs).toBeCloseTo(at + 2)
  })

  it('replays from the start and slow motion halts nothing but stretches time', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    c.step(0)
    c.step(1e6)
    api.changeSpeed('slow')
    api.replay()
    expect(api.playback.value).toMatchObject({ status: 'playing', elapsedMs: 0, speed: 'slow' })
    c.step(0)
    c.step(SPEEDS.slow * 4)
    expect(api.playback.value.elapsedMs).toBeCloseTo(4)
  })

  it('marks the stopping point of a stopped trace only once the animation ends', async () => {
    const { api, c } = make(async () => stopped('timeout'))
    await api.trace()
    expect(api.drawing.value?.stoppedAt).toBeUndefined()
    c.step(0)
    c.step(1e6)
    expect(api.drawing.value?.stoppedAt).toBe('http://b')
    expect(api.summary.value?.outcome.kind).toBe('timeout')
  })

  it('reports an input problem without calling the node', async () => {
    const fn = vi.fn()
    const { api } = make(fn, null)
    await api.trace()
    expect(fn).not.toHaveBeenCalled()
    expect(api.error.value).toMatch(/target/)
    expect(api.drawing.value).toBeUndefined()
  })

  it('reports a failed request and clears the previous trace', async () => {
    const fn = vi.fn().mockResolvedValueOnce(reached()).mockRejectedValueOnce(new Error('HTTP 502'))
    const { api } = make(fn)
    await api.trace()
    expect(api.summary.value).not.toBeNull()
    await api.trace()
    expect(api.error.value).toContain('HTTP 502')
    expect(api.summary.value).toBeNull()
    expect(api.loading.value).toBe(false)
  })

  it('ignores a response that arrives after clear or a newer trace', async () => {
    let release: (r: ReturnType<typeof reached>) => void = () => undefined
    const slow = new Promise<ReturnType<typeof reached>>((r) => (release = r))
    const fn = vi.fn().mockReturnValueOnce(slow).mockResolvedValueOnce(stopped('loop'))
    const { api } = make(fn)
    const first = api.trace()
    await api.trace()
    release(reached())
    await first
    expect(api.summary.value?.outcome.kind).toBe('loop')
    api.clear()
    expect(api.summary.value).toBeNull()
  })

  it('stops the animation loop when its scope ends', async () => {
    const { api, c, scope } = make(async () => reached())
    await api.trace()
    expect(c.pending).toBe(true)
    scope.stop()
    expect(c.pending).toBe(false)
  })
})
