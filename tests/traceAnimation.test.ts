import { describe, expect, it } from 'vitest'
import {
  activeHop,
  buildTimeline,
  displayDurationMs,
  frameAt,
  idlePlayback,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
  NOMINAL_VIEWER_LEG_MS,
  pause,
  resume,
  setSpeed,
  SPEED_MULTIPLIER,
  start,
  tick,
  traceMsPerDisplayMs,
  trailFrames,
  VIEWER_LEG_SHARE,
} from '../src/utils/traceAnimation'
import { hop, path, reached, stopped, trace } from './traces'

const V = 'viewer'
// The viewer legs are a share of the reported time, not a constant.
const LEG = 36 * VIEWER_LEG_SHARE
const kinds = (t: ReturnType<typeof buildTimeline>) => t.segments.map((s) => `${s.direction}:${s.kind}:${s.from}>${s.to}:${s.durationMs}`)

describe('buildTimeline', () => {
  it('goes viewer to entry, hop by hop to the target and back, timed from the returned durations', () => {
    const t = buildTimeline(reached(), V)
    expect(kinds(t)).toEqual([
      `out:transit:viewer>http://a:${LEG}`,
      'out:dwell:http://a>http://a:2',
      'out:transit:http://a>http://b:10',
      'out:dwell:http://b>http://b:3',
      'out:transit:http://b>http://c:5',
      'out:dwell:http://c>http://c:1',
      'back:transit:http://c>http://b:5',
      'back:transit:http://b>http://a:10',
      `back:transit:http://a>viewer:${LEG}`,
    ])
    expect(t.roundTrip).toBe(true)
    expect(t.reportedMs).toBe(36)
    expect(t.totalMs).toBeCloseTo(2 * LEG + 36)
  })

  it('marks only the viewer legs as not reported', () => {
    const t = buildTimeline(reached(), V)
    expect(t.segments.filter((s) => !s.reported).map((s) => s.from + '>' + s.to)).toEqual(['viewer>http://a', 'http://a>viewer'])
  })

  it('places segments back to back without gaps', () => {
    const t = buildTimeline(reached(), V)
    t.segments.forEach((s, i) => {
      if (i > 0) expect(s.startMs).toBeCloseTo(t.segments[i - 1].startMs + t.segments[i - 1].durationMs)
    })
  })

  it('never invents a hop: every node on the path is a returned hop or the viewer', () => {
    const r = reached()
    const known = new Set([V, ...r.hops.map((h) => h.base_url)])
    for (const s of buildTimeline(r, V).segments) {
      expect(known.has(s.from)).toBe(true)
      expect(known.has(s.to)).toBe(true)
    }
  })

  it.each(['ttl', 'no_route', 'loop', 'timeout'] as const)('a %s stop ends at the last returned hop with no way back', (reason) => {
    const t = buildTimeline(stopped(reason), V)
    expect(t.roundTrip).toBe(false)
    expect(t.segments.every((s) => s.direction === 'out')).toBe(true)
    expect(t.segments.at(-1)?.to).toBe('http://b')
    expect(t.segments.some((s) => s.kind === 'wait')).toBe(false)
  })

  it('waits at the last hop when the target did not answer and the node reported how long it waited', () => {
    const r = trace(path(['http://a', 2, 20], ['http://b', 3, 40]), { reached: false, stopped_reason: 'target_unreachable', target: 'http://c' })
    const t = buildTimeline(r, V)
    expect(t.segments.at(-1)).toMatchObject({ kind: 'wait', from: 'http://b', durationMs: 40 })
    const reported = 2 + 10 + 3 + 40
    expect(t.reportedMs).toBe(reported)
    expect(t.totalMs).toBeCloseTo(reported * (1 + VIEWER_LEG_SHARE))
  })

  it('repeats a looping node exactly as returned', () => {
    const r = trace(path(['http://a', 1, 4], ['http://b', 1, 4], ['http://a', 1]), { reached: false, stopped_reason: 'loop', target: 'http://c' })
    const dwellAt = buildTimeline(r, V).segments.filter((s) => s.kind === 'dwell').map((s) => s.from)
    expect(dwellAt).toEqual(['http://a', 'http://b', 'http://a'])
  })

  it('handles a single hop that is the target', () => {
    const t = buildTimeline(trace([hop('http://a', 4)]), V)
    const leg = 4 * VIEWER_LEG_SHARE
    expect(kinds(t)).toEqual([`out:transit:viewer>http://a:${leg}`, 'out:dwell:http://a>http://a:4', `back:transit:http://a>viewer:${leg}`])
  })

  it('has nothing to animate without hops', () => {
    expect(buildTimeline(trace([], { reached: false, stopped_reason: 'no_route' }), V)).toEqual({ segments: [], totalMs: 0, reportedMs: 0, hopCount: 0, roundTrip: false })
  })

  it('treats missing, negative and non-finite durations as zero', () => {
    const r = trace([hop('http://a', Number.NaN, -5, 0), hop('http://b', -1, null, 1)])
    const t = buildTimeline(r, V)
    const measured = t.segments.filter((s) => s.reported)
    expect(measured.every((s) => s.durationMs === 0)).toBe(true)
  })
})

describe('frameAt', () => {
  const t = buildTimeline(reached(), V)

  it('starts at the viewer with the packet just leaving', () => {
    expect(frameAt(t, 0)).toMatchObject({ from: V, to: 'http://a', fraction: 0, direction: 'out', reachedOut: [], finished: false })
  })

  it('interpolates along a leg by its returned duration', () => {
    const at = LEG + 2 + 5
    expect(frameAt(t, at)).toMatchObject({ from: 'http://a', to: 'http://b', kind: 'transit' })
    expect(frameAt(t, at)?.fraction).toBeCloseTo(0.5)
  })

  it('holds still at a node while it processes', () => {
    expect(frameAt(t, LEG + 1)).toMatchObject({ kind: 'dwell', from: 'http://a', to: 'http://a', fraction: 0 })
  })

  it('reaches every hop in order on the way out', () => {
    const seen: string[] = []
    for (let ms = 0; ms <= t.totalMs; ms += 0.5) for (const id of frameAt(t, ms)?.reachedOut ?? []) if (!seen.includes(id)) seen.push(id)
    expect(seen).toEqual(['http://a', 'http://b', 'http://c'])
  })

  it('finishes back at the viewer', () => {
    expect(frameAt(t, t.totalMs)).toMatchObject({ to: V, fraction: 1, direction: 'back', finished: true })
  })

  it('clamps time before the start and after the end, and ignores NaN', () => {
    expect(frameAt(t, -10)).toEqual(frameAt(t, 0))
    expect(frameAt(t, t.totalMs + 999)).toEqual(frameAt(t, t.totalMs))
    expect(frameAt(t, Number.NaN)).toEqual(frameAt(t, 0))
  })

  it('is null for an empty timeline', () => {
    expect(frameAt(buildTimeline(trace([]), V), 5)).toBeNull()
  })

  it('a stopped trace finishes at its last hop, not back at the viewer', () => {
    const s = buildTimeline(stopped('no_route'), V)
    expect(frameAt(s, s.totalMs)).toMatchObject({ finished: true, to: 'http://b', reachedOut: ['http://a', 'http://b'] })
  })

  it('does not stall on a zero-length leg', () => {
    const z = buildTimeline(trace(path(['http://a', 0, 0], ['http://b', 2])), V)
    expect(frameAt(z, z.segments[0].durationMs + 1)).toMatchObject({ kind: 'dwell', from: 'http://b' })
  })
})

describe('playback', () => {
  const t = buildTimeline(reached(), V)

  it('does not move until started', () => {
    expect(tick(idlePlayback(), 100, t)).toEqual(idlePlayback())
  })

  it('advances in trace time so the whole axis fits the display duration', () => {
    const p = tick(start(idlePlayback(), t), 100, t)
    expect(p).toMatchObject({ status: 'playing', elapsedMs: (100 * t.totalMs) / displayDurationMs(t.reportedMs, 'normal') })
    const slow = tick(start(setSpeed(idlePlayback(), 'slow'), t), 100, t)
    expect(slow.elapsedMs).toBeCloseTo((100 * t.totalMs) / displayDurationMs(t.reportedMs, 'slow'))
    expect(slow.elapsedMs).toBeLessThan(p.elapsedMs)
  })

  it('plays through in exactly the display duration, at either speed', () => {
    for (const speed of ['normal', 'slow'] as const) {
      const d = displayDurationMs(t.reportedMs, speed)
      let p = start(setSpeed(idlePlayback(), speed), t)
      for (let i = 0; i < 100; i++) p = tick(p, d / 100 - 1e-6, t)
      expect(p.status).toBe('playing')
      p = tick(p, 1, t)
      expect(p.status).toBe('finished')
    }
  })

  it('finishes exactly at the end and then stays put', () => {
    const p = tick(start(idlePlayback(), t), 1e9, t)
    expect(p).toMatchObject({ status: 'finished', elapsedMs: t.totalMs })
    expect(tick(p, 1000, t)).toBe(p)
  })

  it('pauses, holds, and resumes where it stopped', () => {
    let p = tick(start(idlePlayback(), t), 500, t)
    const at = p.elapsedMs
    p = pause(p)
    expect(tick(p, 500, t).elapsedMs).toBe(at)
    p = tick(resume(p), 500, t)
    expect(p.elapsedMs).toBeGreaterThan(at)
  })

  it('replay restarts from zero and keeps the chosen speed', () => {
    const done = tick(start(setSpeed(idlePlayback(), 'slow'), t), 1e9, t)
    expect(start(done, t)).toMatchObject({ status: 'playing', elapsedMs: 0, speed: 'slow' })
  })

  it('pause and resume are no-ops in the wrong state', () => {
    const idle = idlePlayback()
    expect(pause(idle)).toBe(idle)
    expect(resume(idle)).toBe(idle)
  })

  it('an empty timeline finishes at once, and bad deltas are ignored', () => {
    const empty = buildTimeline(trace([]), V)
    expect(start(idlePlayback(), empty).status).toBe('finished')
    const p = start(idlePlayback(), t)
    expect(tick(p, Number.NaN, t)).toBe(p)
    expect(tick(p, -5, t)).toBe(p)
  })

  it('slow motion is slower than normal', () => {
    expect(SPEED_MULTIPLIER.slow).toBeGreaterThan(SPEED_MULTIPLIER.normal)
  })
})

describe('displayDurationMs', () => {
  it('plays a typical few-millisecond path for about four seconds', () => {
    expect(displayDurationMs(4, 'normal')).toBe(4000)
    expect(displayDurationMs(4.6, 'normal')).toBeGreaterThan(3500)
    expect(displayDurationMs(4.6, 'normal')).toBeLessThan(5500)
  })

  it('never goes below the minimum or above the maximum', () => {
    expect(displayDurationMs(0.01, 'normal')).toBe(MIN_DISPLAY_MS)
    expect(displayDurationMs(0, 'normal')).toBe(MIN_DISPLAY_MS)
    expect(displayDurationMs(Number.NaN, 'normal')).toBe(MIN_DISPLAY_MS)
    expect(displayDurationMs(5000, 'normal')).toBe(MAX_DISPLAY_MS)
  })

  it('slow is about two and a half times longer, at every size', () => {
    for (const ms of [0.1, 4, 8, 500]) expect(displayDurationMs(ms, 'slow')).toBeCloseTo(displayDurationMs(ms, 'normal') * 2.5)
  })

  it('grows with the reported time between the limits', () => {
    expect(displayDurationMs(6, 'normal')).toBeGreaterThan(displayDurationMs(4, 'normal'))
  })
})

describe('duration normalisation', () => {
  it('counts only reported time, so the viewer legs never change the duration', () => {
    const t = buildTimeline(reached(), V)
    expect(t.reportedMs).toBe(36)
    const sum = t.segments.filter((s) => s.reported).reduce((a, s) => a + s.durationMs, 0)
    expect(t.reportedMs).toBeCloseTo(sum)
    expect(displayDurationMs(t.reportedMs, 'normal')).toBe(MAX_DISPLAY_MS)
  })

  it('keeps the proportions of the segments whatever the display time', () => {
    const t = buildTimeline(trace(path(['http://a', 1, 2], ['http://b', 1])), V)
    for (const speed of ['normal', 'slow'] as const) {
      const display = t.segments.map((s) => s.durationMs / traceMsPerDisplayMs(t, speed))
      expect(display.reduce((a, b) => a + b, 0)).toBeCloseTo(displayDurationMs(t.reportedMs, speed))
      const reportedOnly = t.segments.flatMap((s, i) => (s.reported ? [display[i]] : []))
      // dwell 1 ms : leg 1 ms : dwell 1 ms : leg 1 ms back, so all four equal; the viewer legs are 12% of the sum.
      for (const d of reportedOnly) expect(d).toBeCloseTo(reportedOnly[0])
    }
    const dwell = t.segments.find((s) => s.kind === 'dwell')!
    const leg = t.segments.find((s) => s.kind === 'transit' && s.reported)!
    expect(dwell.durationMs / leg.durationMs).toBe(1)
  })

  it('a viewer leg is a small, fixed share of the axis', () => {
    const t = buildTimeline(reached(), V)
    const leg = t.segments[0].durationMs
    expect(leg / t.totalMs).toBeLessThan(0.1)
    expect(t.segments.at(-1)?.durationMs).toBe(leg)
  })

  it('falls back to the nominal viewer leg when nothing was reported', () => {
    const t = buildTimeline(trace([hop('http://a', 0)]), V)
    expect(t.reportedMs).toBe(0)
    expect(t.segments[0].durationMs).toBe(NOMINAL_VIEWER_LEG_MS)
    expect(displayDurationMs(t.reportedMs, 'normal')).toBe(MIN_DISPLAY_MS)
  })

  it('a stopped trace with a wait counts the wait too', () => {
    const r = trace(path(['http://a', 2, 20], ['http://b', 3, 40]), { reached: false, stopped_reason: 'target_unreachable', target: 'http://c' })
    expect(buildTimeline(r, V).reportedMs).toBe(2 + 10 + 3 + 40)
  })
})

describe('activeHop', () => {
  const t = buildTimeline(reached(), V)
  const at = (ms: number) => activeHop(t, frameAt(t, ms))

  it('is none while travelling to the entry node, then follows the hops out', () => {
    expect(at(0)).toBeNull()
    expect(at(LEG + 1)).toBe(0)
    expect(at(LEG + 2 + 5)).toBe(0)
    expect(at(LEG + 2 + 10 + 1)).toBe(1)
    expect(at(LEG + 2 + 10 + 3 + 5 + 0.5)).toBe(2)
  })

  it('follows the packet back and ends on the last hop', () => {
    const backStart = t.segments.find((s) => s.direction === 'back')!.startMs
    expect(at(backStart + 0.1)).toBe(2)
    expect(at(t.totalMs)).toBe(2)
    expect(at(t.totalMs - 0.01)).toBe(0)
  })

  it('a stopped trace stays on its last hop, and nothing is active without a frame', () => {
    const s = buildTimeline(stopped('no_route'), V)
    expect(activeHop(s, frameAt(s, s.totalMs))).toBe(1)
    expect(activeHop(t, null)).toBeNull()
  })
})

describe('trailFrames', () => {
  const t = buildTimeline(reached(), V)

  it('has no tail at the start and grows behind the packet', () => {
    expect(trailFrames(t, 0)).toEqual([])
    const trail = trailFrames(t, t.totalMs / 2, 6)
    expect(trail).toHaveLength(6)
  })

  it('is ordered newest first and reaches back a fixed fraction of the axis', () => {
    const trail = trailFrames(t, t.totalMs / 2, 5, 0.1)
    const times = trail.map((f) => t.segments[f.segment].startMs)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1])
    expect(trailFrames(t, 1, 5, 0.1).length).toBeLessThan(5)
  })

  it('is empty for an empty timeline', () => {
    expect(trailFrames(buildTimeline(trace([]), V), 5)).toEqual([])
  })
})

describe('buildTimeline without a response', () => {
  const result = { hops: path(['http://a', 1, 4], ['http://b', 1, 4], ['http://a', 1]), reached: true }

  it('plays the path once out and never retraces it, even though the target was reached', () => {
    const full = buildTimeline(result, 'v')
    const once = buildTimeline(result, 'v', { response: false })
    expect(full.segments.some((s) => s.direction === 'back')).toBe(true)
    expect(once.segments.every((s) => s.direction === 'out')).toBe(true)
    expect(once.roundTrip).toBe(false)
    expect(once.totalMs).toBeLessThan(full.totalMs)
    expect(once.reportedMs).toBeLessThan(full.reportedMs)
  })
})
