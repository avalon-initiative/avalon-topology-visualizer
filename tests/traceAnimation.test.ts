import { describe, expect, it } from 'vitest'
import { buildTimeline, frameAt, idlePlayback, NOMINAL_VIEWER_LEG_MS, pause, resume, setSpeed, SPEEDS, start, tick } from '../src/utils/traceAnimation'
import { hop, path, reached, stopped, trace } from './traces'

const V = 'viewer'
const kinds = (t: ReturnType<typeof buildTimeline>) => t.segments.map((s) => `${s.direction}:${s.kind}:${s.from}>${s.to}:${s.durationMs}`)

describe('buildTimeline', () => {
  it('goes viewer to entry, hop by hop to the target and back, timed from the returned durations', () => {
    const t = buildTimeline(reached(), V)
    expect(kinds(t)).toEqual([
      `out:transit:viewer>http://a:${NOMINAL_VIEWER_LEG_MS}`,
      'out:dwell:http://a>http://a:2',
      'out:transit:http://a>http://b:10',
      'out:dwell:http://b>http://b:3',
      'out:transit:http://b>http://c:5',
      'out:dwell:http://c>http://c:1',
      'back:transit:http://c>http://b:5',
      'back:transit:http://b>http://a:10',
      `back:transit:http://a>viewer:${NOMINAL_VIEWER_LEG_MS}`,
    ])
    expect(t.roundTrip).toBe(true)
    expect(t.totalMs).toBe(2 * NOMINAL_VIEWER_LEG_MS + 2 + 10 + 3 + 5 + 1 + 5 + 10)
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
    expect(t.totalMs).toBe(NOMINAL_VIEWER_LEG_MS + 2 + 10 + 3 + 40)
  })

  it('repeats a looping node exactly as returned', () => {
    const r = trace(path(['http://a', 1, 4], ['http://b', 1, 4], ['http://a', 1]), { reached: false, stopped_reason: 'loop', target: 'http://c' })
    const dwellAt = buildTimeline(r, V).segments.filter((s) => s.kind === 'dwell').map((s) => s.from)
    expect(dwellAt).toEqual(['http://a', 'http://b', 'http://a'])
  })

  it('handles a single hop that is the target', () => {
    const t = buildTimeline(trace([hop('http://a', 4)]), V)
    expect(kinds(t)).toEqual([`out:transit:viewer>http://a:${NOMINAL_VIEWER_LEG_MS}`, 'out:dwell:http://a>http://a:4', `back:transit:http://a>viewer:${NOMINAL_VIEWER_LEG_MS}`])
  })

  it('has nothing to animate without hops', () => {
    expect(buildTimeline(trace([], { reached: false, stopped_reason: 'no_route' }), V)).toEqual({ segments: [], totalMs: 0, roundTrip: false })
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
    const at = NOMINAL_VIEWER_LEG_MS + 2 + 5
    expect(frameAt(t, at)).toMatchObject({ from: 'http://a', to: 'http://b', kind: 'transit' })
    expect(frameAt(t, at)?.fraction).toBeCloseTo(0.5)
  })

  it('holds still at a node while it processes', () => {
    expect(frameAt(t, NOMINAL_VIEWER_LEG_MS + 1)).toMatchObject({ kind: 'dwell', from: 'http://a', to: 'http://a', fraction: 0 })
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
    expect(frameAt(z, NOMINAL_VIEWER_LEG_MS + 1)).toMatchObject({ kind: 'dwell', from: 'http://b' })
  })
})

describe('playback', () => {
  const t = buildTimeline(reached(), V)

  it('does not move until started', () => {
    expect(tick(idlePlayback(), 100, t)).toEqual(idlePlayback())
  })

  it('advances in trace time scaled by the speed, not by wall time alone', () => {
    const p = tick(start(idlePlayback(), t), 100, t)
    expect(p).toMatchObject({ status: 'playing', elapsedMs: 100 / SPEEDS.normal })
    const slow = tick(start(setSpeed(idlePlayback(), 'slow'), t), 100, t)
    expect(slow.elapsedMs).toBe(100 / SPEEDS.slow)
    expect(slow.elapsedMs).toBeLessThan(p.elapsedMs)
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
    expect(SPEEDS.slow).toBeGreaterThan(SPEEDS.normal)
  })
})
