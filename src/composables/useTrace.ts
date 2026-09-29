import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { TraceResult } from '@avalon-initiative/protocol-sdk'
import { runTrace, TraceInputError } from '../api/tracer'
import type { TraceRequest } from '../api/tracer'
import type { TraceDrawing } from '../utils/drawTrace'
import { VIEWER_ID } from '../utils/rttStats'
import type { Point } from '../utils/layout'
import { activeHop, buildTimeline, frameAt, idlePlayback, pause, resume, setSpeed, start, tick, trailFrames } from '../utils/traceAnimation'
import type { Playback, SpeedName } from '../utils/traceAnimation'
import { summarizeTrace } from '../utils/traceSummary'
import { placeViewerMarker, VIEWER_MARKER_LABEL } from '../utils/viewerMarker'

// Marker distance and the space kept clear around it, in screen pixels so they hold at any zoom.
const MARKER_DISTANCE_PX = 84
const MARKER_CLEARANCE_PX = 48
// Each node's label and hop timing sit below it, so that strip is kept clear too.
const LABEL_STRIP_PX = 34

export interface TraceOptions {
  /** The selected node: the default target, and what the entry and target buttons pick up. */
  target: Ref<string | undefined>
  /** Node positions on the map, so a temporary viewer marker can sit beside the entry node. */
  positions?: () => Record<string, Point>
  /** Screen pixels per world unit. */
  scale?: () => number
  /** Whether a world point is on the visible map, so the viewer marker is not placed off screen. */
  onScreen?: (p: Point) => boolean
  /** Entry node used when the field is left empty, usually the seed. */
  defaultEntry: () => string
  traceFn?: TraceRequest['traceFn']
  raf?: (cb: (now: number) => void) => number
  cancelRaf?: (id: number) => void
}

/** Runs one trace at a time and plays it back; the path and timings come only from the returned hops. */
export function useTrace(options: TraceOptions) {
  const entryInput = ref('')
  const result = shallowRef<TraceResult | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  const playback = shallowRef<Playback>(idlePlayback())
  const raf = options.raf ?? ((cb) => requestAnimationFrame(cb))
  const cancelRaf = options.cancelRaf ?? ((id) => cancelAnimationFrame(id))
  let frameId: number | undefined
  let lastNow: number | undefined
  let epoch = 0

  const targetPick = ref<string | undefined>()
  // Selecting another node makes it the target again; an explicit pick or swap holds until then.
  watch(options.target, () => (targetPick.value = undefined))
  const entry = computed(() => entryInput.value.trim() || options.defaultEntry())
  const target = computed(() => targetPick.value ?? options.target.value)
  const timeline = computed(() => buildTimeline(result.value ?? { hops: [], reached: false }, VIEWER_ID))
  const summary = computed(() => (result.value ? summarizeTrace(result.value) : null))
  const frame = computed(() => frameAt(timeline.value, playback.value.elapsedMs))
  const hop = computed(() => activeHop(timeline.value, frame.value))
  const viewer = computed(() => {
    const positions = options.positions?.() ?? {}
    const entryId = result.value?.hops[0]?.base_url
    const at = entryId ? positions[entryId] : undefined
    if (!at || positions[VIEWER_ID]) return undefined
    const scale = options.scale?.() || 1
    const nodes = Object.values(positions).flatMap((p) => [p, { x: p.x, y: p.y + LABEL_STRIP_PX / scale }])
    return { id: VIEWER_ID, label: VIEWER_MARKER_LABEL, at: placeViewerMarker(at, nodes, { distance: MARKER_DISTANCE_PX / scale, clearance: MARKER_CLEARANCE_PX / scale, accept: options.onScreen }) }
  })
  const drawing = computed<TraceDrawing | undefined>(() => {
    if (!result.value || !result.value.hops.length) return undefined
    const hops = result.value.hops.map((h) => h.base_url)
    const ended = playback.value.status === 'finished' && !result.value.reached
    const playing = playback.value.status !== 'finished'
    return {
      path: [VIEWER_ID, ...hops],
      frame: frame.value,
      stoppedAt: ended ? hops[hops.length - 1] : undefined,
      stoppedLabel: ended ? summary.value?.outcome.title : undefined,
      viewer: viewer.value,
      hops: summary.value?.rows,
      activeHop: hop.value,
      trail: playing ? trailFrames(timeline.value, playback.value.elapsedMs) : [],
    }
  })

  function halt() {
    if (frameId !== undefined) cancelRaf(frameId)
    frameId = undefined
    lastNow = undefined
  }

  function loop(now: number) {
    frameId = undefined
    const dt = lastNow === undefined ? 0 : now - lastNow
    lastNow = now
    playback.value = tick(playback.value, dt, timeline.value)
    if (playback.value.status === 'playing') frameId = raf(loop)
  }

  function run() {
    halt()
    if (playback.value.status === 'playing') frameId = raf(loop)
  }

  function replay() {
    if (!result.value) return
    playback.value = start(playback.value, timeline.value)
    run()
  }

  function togglePause() {
    playback.value = playback.value.status === 'playing' ? pause(playback.value) : resume(playback.value)
    run()
  }

  function changeSpeed(speed: SpeedName) {
    playback.value = setSpeed(playback.value, speed)
  }

  async function trace() {
    const mine = ++epoch
    halt()
    error.value = null
    result.value = null
    playback.value = idlePlayback(playback.value.speed)
    loading.value = true
    try {
      const res = await runTrace({ entry: entry.value, target: target.value ?? '', traceFn: options.traceFn })
      if (mine !== epoch) return
      result.value = res
      replay()
    } catch (e) {
      if (mine !== epoch) return
      error.value = e instanceof TraceInputError ? e.message : `The trace request failed: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      if (mine === epoch) loading.value = false
    }
  }

  function pickEntry() {
    if (options.target.value) entryInput.value = options.target.value
  }

  function pickTarget() {
    targetPick.value = options.target.value
  }

  function swap() {
    const to = target.value
    if (!to) return
    const from = entry.value
    entryInput.value = to
    targetPick.value = from
  }

  function clear() {
    epoch++
    halt()
    result.value = null
    error.value = null
    loading.value = false
    playback.value = idlePlayback(playback.value.speed)
  }

  onScopeDispose(halt)

  return { entryInput, entry, target, hop, pickEntry, pickTarget, swap, result, error, loading, playback, timeline, summary, frame, drawing, trace, replay, togglePause, changeSpeed, clear }
}
