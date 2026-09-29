import type { TraceResult } from '@avalon-initiative/protocol-sdk'

/** Display-only length of the viewer's own leg: no node reports it, so it never counts toward any total. */
export const NOMINAL_VIEWER_LEG_MS = 5

export type SegmentKind = 'transit' | 'dwell' | 'wait'
export type Direction = 'out' | 'back'

export interface Segment {
  kind: SegmentKind
  from: string
  to: string
  startMs: number
  durationMs: number
  direction: Direction
  /** Index into the returned hops of the node this segment starts at or is spent on; null for the viewer's legs. */
  hopIndex: number | null
  /** False for the viewer's legs, whose length is nominal. */
  reported: boolean
}

export interface Timeline {
  segments: Segment[]
  totalMs: number
  /** True when the packet returns to the viewer; only a trace that reached its target does. */
  roundTrip: boolean
}

const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/**
 * Lays the returned hops on one time axis: viewer to entry node, each node's processing, each leg to the next hop,
 * and (when the target was reached) the legs back. `to_next_ms` is a round trip, so each direction gets half.
 * Only returned hops appear; a stopped trace ends at its last hop, waiting there if the node reported a wait.
 */
export function buildTimeline(result: Pick<TraceResult, 'hops' | 'reached'>, viewerId: string): Timeline {
  const hops = result.hops
  const segments: Segment[] = []
  let at = 0
  const push = (s: Omit<Segment, 'startMs'>) => {
    segments.push({ ...s, startMs: at })
    at += s.durationMs
  }
  if (hops.length === 0) return { segments, totalMs: 0, roundTrip: false }

  const last = hops.length - 1
  push({ kind: 'transit', from: viewerId, to: hops[0].base_url, durationMs: NOMINAL_VIEWER_LEG_MS, direction: 'out', hopIndex: null, reported: false })
  hops.forEach((hop, i) => {
    push({ kind: 'dwell', from: hop.base_url, to: hop.base_url, durationMs: finite(hop.processing_ms), direction: 'out', hopIndex: i, reported: true })
    if (i < last) {
      push({ kind: 'transit', from: hop.base_url, to: hops[i + 1].base_url, durationMs: finite(hop.to_next_ms) / 2, direction: 'out', hopIndex: i, reported: true })
    }
  })
  if (!result.reached) {
    const waited = finite(hops[last].to_next_ms)
    if (waited > 0) push({ kind: 'wait', from: hops[last].base_url, to: hops[last].base_url, durationMs: waited, direction: 'out', hopIndex: last, reported: true })
    return { segments, totalMs: at, roundTrip: false }
  }
  for (let i = last - 1; i >= 0; i--) {
    push({ kind: 'transit', from: hops[i + 1].base_url, to: hops[i].base_url, durationMs: finite(hops[i].to_next_ms) / 2, direction: 'back', hopIndex: i, reported: true })
  }
  push({ kind: 'transit', from: hops[0].base_url, to: viewerId, durationMs: NOMINAL_VIEWER_LEG_MS, direction: 'back', hopIndex: null, reported: false })
  return { segments, totalMs: at, roundTrip: true }
}

export interface Frame {
  /** Index of the segment the packet is in; -1 for an empty timeline. */
  segment: number
  from: string
  to: string
  /** 0 to 1 along from to to; 0 while dwelling at a node. */
  fraction: number
  direction: Direction
  kind: SegmentKind
  /** Every hop node the packet has reached so far on the way out, in order. */
  reachedOut: string[]
  finished: boolean
}

/** Where the packet is at `elapsedMs` of trace time. Pure: same inputs, same frame. */
export function frameAt(timeline: Timeline, elapsedMs: number): Frame | null {
  const { segments, totalMs } = timeline
  if (segments.length === 0) return null
  const t = Math.min(Math.max(Number.isFinite(elapsedMs) ? elapsedMs : 0, 0), totalMs)
  const finished = t >= totalMs
  let index = segments.findIndex((s) => t >= s.startMs && t < s.startMs + s.durationMs)
  if (index === -1) index = finished ? segments.length - 1 : 0
  const s = segments[index]
  const fraction = s.kind !== 'transit' ? 0 : finished ? 1 : s.durationMs === 0 ? 1 : (t - s.startMs) / s.durationMs
  const reachedOut: string[] = []
  segments.forEach((seg, i) => {
    const arrived = seg.direction === 'out' && seg.kind === 'transit' && (i < index || (i === index && fraction >= 1))
    if (arrived) reachedOut.push(seg.to)
  })
  return { segment: index, from: s.from, to: s.to, fraction, direction: s.direction, kind: s.kind, reachedOut, finished }
}

export type SpeedName = 'normal' | 'slow'
/** Display milliseconds spent per trace millisecond, so a few-millisecond path is watchable. */
export const SPEEDS: Record<SpeedName, number> = { normal: 25, slow: 100 }

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished'

export interface Playback {
  status: PlaybackStatus
  /** Elapsed trace time, not wall time. */
  elapsedMs: number
  speed: SpeedName
}

export const idlePlayback = (speed: SpeedName = 'normal'): Playback => ({ status: 'idle', elapsedMs: 0, speed })

/** Starts from the beginning: the first play and every replay. An empty timeline finishes at once. */
export function start(p: Playback, timeline: Timeline): Playback {
  return timeline.totalMs > 0 ? { ...p, status: 'playing', elapsedMs: 0 } : { ...p, status: 'finished', elapsedMs: 0 }
}

export function pause(p: Playback): Playback {
  return p.status === 'playing' ? { ...p, status: 'paused' } : p
}

export function resume(p: Playback): Playback {
  return p.status === 'paused' ? { ...p, status: 'playing' } : p
}

export function setSpeed(p: Playback, speed: SpeedName): Playback {
  return { ...p, speed }
}

/** Advances by `dtMs` of display time. Only a playing state moves; reaching the end finishes it exactly at the end. */
export function tick(p: Playback, dtMs: number, timeline: Timeline): Playback {
  if (p.status !== 'playing' || !Number.isFinite(dtMs) || dtMs <= 0) return p
  const elapsedMs = p.elapsedMs + dtMs / SPEEDS[p.speed]
  return elapsedMs >= timeline.totalMs ? { ...p, status: 'finished', elapsedMs: timeline.totalMs } : { ...p, elapsedMs }
}
