import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTrace } from '../src/composables/useTrace'
import { traceMsPerDisplayMs } from '../src/utils/traceAnimation'
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

/** Display milliseconds that advance `ms` of trace time at a speed. */
const disp = (api: ReturnType<typeof make>['api'], ms: number, speed: 'normal' | 'slow' = 'normal') => ms / traceMsPerDisplayMs(api.timeline.value, speed)

function make(traceFn: unknown, target: string | null = 'http://c', extra: Record<string, unknown> = {}) {
  const c = clock()
  const scope = effectScope()
  const t = ref<string | undefined>(target ?? undefined)
  const api = scope.run(() => useTrace({ target: t, defaultEntry: () => 'http://seed', ...extra, traceFn: traceFn as never, raf: c.raf, cancelRaf: c.cancelRaf }))!
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
    c.step(disp(api, 8))
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
    c.step(disp(api, 3))
    api.togglePause()
    const at = api.playback.value.elapsedMs
    expect(c.pending).toBe(false)
    c.step(1000)
    expect(api.playback.value.elapsedMs).toBe(at)
    api.togglePause()
    c.step(0)
    c.step(disp(api, 2))
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
    c.step(disp(api, 4, 'slow'))
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

  it('picks the selected node as the entry, keeping the field editable', async () => {
    const fn = vi.fn(async (..._args: unknown[]) => reached())
    const { api, target } = make(fn)
    target.value = 'http://picked'
    api.pickEntry()
    expect(api.entryInput.value).toBe('http://picked')
    api.entryInput.value = 'http://typed'
    await api.trace()
    expect(fn.mock.calls[0][0]).toBe('http://typed')
  })

  it('does nothing when picking with no selection', () => {
    const { api, target } = make(vi.fn(), null)
    api.pickEntry()
    api.pickTarget()
    expect(api.entryInput.value).toBe('')
    expect(api.target.value).toBeUndefined()
    target.value = undefined
  })

  it('defaults the target to the selected node and holds an explicit pick until another node is selected', async () => {
    const { api, target } = make(vi.fn())
    expect(api.target.value).toBe('http://c')
    target.value = 'http://d'
    api.pickTarget()
    await nextTick()
    expect(api.target.value).toBe('http://d')
    target.value = 'http://e'
    await nextTick()
    expect(api.target.value).toBe('http://e')
  })

  it('swaps entry and target, using the seed when the entry was empty, and traces the swapped pair', async () => {
    const fn = vi.fn(async (..._args: unknown[]) => reached())
    const { api } = make(fn)
    api.swap()
    expect(api.entryInput.value).toBe('http://c')
    expect(api.target.value).toBe('http://seed')
    await api.trace()
    expect(fn).toHaveBeenCalledWith('http://c', 'http://seed', { ttl: 12 })
    api.swap()
    expect(api.entryInput.value).toBe('http://seed')
    expect(api.target.value).toBe('http://c')
  })

  it('swap does nothing without a target', () => {
    const { api } = make(vi.fn(), null)
    api.swap()
    expect(api.entryInput.value).toBe('')
  })

  const map = { 'http://a': { x: 100, y: 0 }, 'http://b': { x: 0, y: 0 }, 'http://c': { x: -100, y: 0 } }

  it('draws a temporary viewer marker beside the entry node when the map has no viewer node, and drops it on clear', async () => {
    const { api } = make(async () => reached(), 'http://c', { positions: () => map })
    await api.trace()
    const v = api.drawing.value?.viewer
    expect(v).toMatchObject({ id: 'viewer:this-browser', label: 'This browser' })
    expect(v!.at.x).toBeGreaterThan(100)
    for (const p of Object.values(map)) expect(Math.hypot(p.x - v!.at.x, p.y - v!.at.y)).toBeGreaterThanOrEqual(48)
    api.clear()
    expect(api.drawing.value).toBeUndefined()
  })

  it('keeps the real viewer node when viewer measurements put one on the map', async () => {
    const { api } = make(async () => reached(), 'http://c', { positions: () => ({ ...map, 'viewer:this-browser': { x: 0, y: 50 } }) })
    await api.trace()
    expect(api.drawing.value?.viewer).toBeUndefined()
  })

  it('skips the marker when the entry node is not on the map', async () => {
    const { api } = make(async () => reached(), 'http://c', { positions: () => ({}) })
    await api.trace()
    expect(api.drawing.value?.viewer).toBeUndefined()
  })

  it('keeps the marker off the nodes at any zoom', async () => {
    const { api } = make(async () => reached(), 'http://c', { positions: () => map, scale: () => 0.5 })
    await api.trace()
    const v = api.drawing.value!.viewer!
    for (const p of Object.values(map)) expect(Math.hypot(p.x - v.at.x, p.y - v.at.y) * 0.5).toBeGreaterThanOrEqual(48 - 1e-9)
  })

  it('keeps the marker on the visible map when the natural spot is off screen', async () => {
    const { api } = make(async () => reached(), 'http://c', { positions: () => map, onScreen: (p: { x: number }) => p.x <= 150 })
    await api.trace()
    expect(api.drawing.value!.viewer!.at.x).toBeLessThanOrEqual(150)
  })

  it('numbers the hops and keeps the highlighted hop in step with playback', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    expect(api.drawing.value?.hops?.map((h) => [h.index + 1, h.url])).toEqual([[1, 'http://a'], [2, 'http://b'], [3, 'http://c']])
    expect(api.hop.value).toBeNull()
    c.step(0)
    c.step(disp(api, 9))
    expect(api.hop.value).toBe(0)
    expect(api.drawing.value?.activeHop).toBe(0)
    c.step(disp(api, 11))
    expect(api.hop.value).toBe(1)
    c.step(1e6)
    expect(api.hop.value).toBe(2)
  })

  it('has a fading trail while playing and none once finished', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    c.step(0)
    c.step(disp(api, 20))
    expect(api.drawing.value?.trail?.length).toBeGreaterThan(0)
    c.step(1e6)
    expect(api.drawing.value?.trail).toEqual([])
  })

  it('labels the end of a stopped trace with its reason', async () => {
    const { api, c } = make(async () => stopped('no_route'))
    await api.trace()
    c.step(0)
    c.step(1e6)
    expect(api.drawing.value?.stoppedLabel).toBe('No route')
  })

  it('plays a typical path over a few seconds of display time', async () => {
    const { api, c } = make(async () => reached())
    await api.trace()
    c.step(0)
    c.step(11999)
    expect(api.playback.value.status).toBe('playing')
    c.step(2)
    expect(api.playback.value.status).toBe('finished')
  })

  it('plays a route through chosen stops and back to the entry as one path', async () => {
    const fn = vi.fn(async (from: string, to: string) => ({ ...reached(), hops: [{ ...reached().hops[0], base_url: from }, { ...reached().hops[1], base_url: to }].map((h, i) => ({ ...h, index: i, to_next_ms: i === 0 ? 4 : undefined })), target: to }))
    const { api } = make(fn)
    api.entryInput.value = 'http://a'
    api.via.value = ['http://b']
    api.returnTrip.value = true
    await api.trace()
    expect(fn.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['http://a', 'http://b'],
      ['http://b', 'http://c'],
      ['http://c', 'http://a'],
    ])
    expect(api.drawing.value?.path).toEqual(['viewer:this-browser', 'http://a', 'http://b', 'http://c', 'http://a'])
    expect(api.timeline.value.segments.some((s) => s.direction === 'back')).toBe(false)
  })

  it('still replays the response back along a plain trace', async () => {
    const { api } = make(vi.fn(async () => reached()))
    await api.trace()
    expect(api.timeline.value.segments.some((s) => s.direction === 'back')).toBe(true)
  })

  it('adds the selected node as a stop and removes stops by position', () => {
    const { api, target } = make(vi.fn())
    target.value = 'http://b'
    api.addVia()
    target.value = 'http://d'
    api.addVia()
    expect(api.via.value).toEqual(['http://b', 'http://d'])
    api.removeVia(0)
    expect(api.via.value).toEqual(['http://d'])
  })

  it('still sends a single plain trace when there are no stops and no return', async () => {
    const fn = vi.fn(async () => reached())
    const { api } = make(fn)
    await api.trace()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
