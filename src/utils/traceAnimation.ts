import type { TraceResult } from '@avalon-initiative/protocol-sdk'

/** Display-only length of the viewer's own leg when nothing was reported: no node reports it, so it never counts toward any total. */
export const NOMINAL_VIEWER_LEG_MS = 5
/** Each viewer leg is drawn as this share of the reported time, so it stays a small part of any trace. */
export const VIEWER_LEG_SHARE = 0.12

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
  /** Length of the whole axis, viewer legs included. */
  totalMs: number
  /** Only what the nodes reported: the viewer's nominal legs are never in it. */
  reportedMs: number
  /** Number of returned hops. */
  hopCount: number
  /** True when the packet returns to the viewer; only a trace that reached its target does. */
  roundTrip: boolean
}

const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/** Everything the nodes reported along the path, in the same terms the segments use; the viewer's legs are not part of it. */
function reportedTotal(result: Pick<TraceResult, 'hops' | 'reached'>, response: boolean): number {
  const hops = result.hops
  const last = hops.length - 1
  let sum = 0
  hops.forEach((h, i) => {
    sum += finite(h.processing_ms)
    // A leg is drawn once out and, only when the target answered and a response is shown, once back, each half of the round trip.
    if (i < last) sum += (finite(h.to_next_ms) / 2) * (response ? 2 : 1)
  })
  if (!result.reached) sum += finite(hops[last]?.to_next_ms)
  return sum
}

/**
 * Lays the returned hops on one time axis: viewer to entry node, each node's processing, each leg to the next hop,
 * and (when the target was reached) the legs back. `to_next_ms` is a round trip, so each direction gets half.
 * Only returned hops appear; a stopped trace ends at its last hop, waiting there if the node reported a wait.
 */
export function buildTimeline(result: Pick<TraceResult, 'hops' | 'reached'>, viewerId: string, options: { response?: boolean } = {}): Timeline {
  // `response: false` plays the path once, out only: for a route made of several traces, whose path is the story.
  const response = result.reached && options.response !== false
  const hops = result.hops
  const segments: Segment[] = []
  let at = 0
  const push = (s: Omit<Segment, 'startMs'>) => {
    segments.push({ ...s, startMs: at })
    at += s.durationMs
  }
  if (hops.length === 0) return { segments, totalMs: 0, reportedMs: 0, hopCount: 0, roundTrip: false }

  const last = hops.length - 1
  const reportedMs = reportedTotal(result, response)
  const viewerLeg = reportedMs > 0 ? reportedMs * VIEWER_LEG_SHARE : NOMINAL_VIEWER_LEG_MS
  push({ kind: 'transit', from: viewerId, to: hops[0].base_url, durationMs: viewerLeg, direction: 'out', hopIndex: null, reported: false })
  hops.forEach((hop, i) => {
    push({ kind: 'dwell', from: hop.base_url, to: hop.base_url, durationMs: finite(hop.processing_ms), direction: 'out', hopIndex: i, reported: true })
    if (i < last) {
      push({ kind: 'transit', from: hop.base_url, to: hops[i + 1].base_url, durationMs: finite(hop.to_next_ms) / 2, direction: 'out', hopIndex: i, reported: true })
    }
  })
  if (!result.reached) {
    const waited = finite(hops[last].to_next_ms)
    if (waited > 0) push({ kind: 'wait', from: hops[last].base_url, to: hops[last].base_url, durationMs: waited, direction: 'out', hopIndex: last, reported: true })
    return { segments, totalMs: at, reportedMs, hopCount: hops.length, roundTrip: false }
  }
  if (!response) return { segments, totalMs: at, reportedMs, hopCount: hops.length, roundTrip: false }
  for (let i = last - 1; i >= 0; i--) {
    push({ kind: 'transit', from: hops[i + 1].base_url, to: hops[i].base_url, durationMs: finite(hops[i].to_next_ms) / 2, direction: 'back', hopIndex: i, reported: true })
  }
  push({ kind: 'transit', from: hops[0].base_url, to: viewerId, durationMs: viewerLeg, direction: 'back', hopIndex: null, reported: false })
  return { segments, totalMs: at, reportedMs, hopCount: hops.length, roundTrip: true }
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
/** Display milliseconds per reported millisecond before clamping: a 4 ms path plays for about 4 s. */
export const DISPLAY_MS_PER_TRACE_MS = 1000
export const MIN_DISPLAY_MS = 2500
export const MAX_DISPLAY_MS = 12000
export const SPEED_MULTIPLIER: Record<SpeedName, number> = { normal: 1, slow: 2.5 }

/** How long the whole animation takes on screen: the reported time scaled, clamped, then stretched by the speed. */
export function displayDurationMs(reportedMs: number, speed: SpeedName): number {
  const scaled = Number.isFinite(reportedMs) && reportedMs > 0 ? reportedMs * DISPLAY_MS_PER_TRACE_MS : 0
  return Math.min(MAX_DISPLAY_MS, Math.max(MIN_DISPLAY_MS, scaled)) * SPEED_MULTIPLIER[speed]
}

/** Trace milliseconds that pass per display millisecond, so the whole axis fits the display duration. */
export function traceMsPerDisplayMs(timeline: Timeline, speed: SpeedName): number {
  return timeline.totalMs / displayDurationMs(timeline.reportedMs, speed)
}

/** The hop the packet is at or has just left, for highlighting a row; null before it reaches the first hop. */
export function activeHop(timeline: Timeline, frame: Frame | null): number | null {
  if (!frame) return null
  if (frame.finished) return timeline.hopCount - 1
  const seg = timeline.segments[frame.segment]
  if (seg.direction === 'out') return seg.hopIndex
  if (seg.hopIndex === null) return 0
  return frame.fraction < 0.5 ? seg.hopIndex + 1 : seg.hopIndex
}

/** Frames just behind the packet, newest first, spanning `windowFraction` of the axis; the drawing fades them out. */
export function trailFrames(timeline: Timeline, elapsedMs: number, count = 10, windowFraction = 0.1): Frame[] {
  if (timeline.totalMs <= 0 || count <= 0) return []
  const step = (timeline.totalMs * windowFraction) / count
  const out: Frame[] = []
  for (let k = 1; k <= count; k++) {
    const at = elapsedMs - k * step
    if (at < 0) break
    const f = frameAt(timeline, at)
    if (f) out.push(f)
  }
  return out
}

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
  const elapsedMs = p.elapsedMs + dtMs * traceMsPerDisplayMs(timeline, p.speed)
  return elapsedMs >= timeline.totalMs ? { ...p, status: 'finished', elapsedMs: timeline.totalMs } : { ...p, elapsedMs }
}
