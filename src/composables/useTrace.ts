import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { TraceResult } from '@avalon-initiative/protocol-sdk'
import { runTrace, TraceInputError } from '../api/tracer'
import type { TraceRequest } from '../api/tracer'
import type { TraceDrawing } from '../utils/drawTrace'
import { VIEWER_ID } from '../utils/rttStats'
import { buildTimeline, frameAt, idlePlayback, pause, resume, setSpeed, start, tick } from '../utils/traceAnimation'
import type { Playback, SpeedName } from '../utils/traceAnimation'
import { summarizeTrace } from '../utils/traceSummary'

export interface TraceOptions {
  /** The node to trace to, usually the selected one. */
  target: Ref<string | undefined>
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

  const entry = computed(() => entryInput.value.trim() || options.defaultEntry())
  const timeline = computed(() => buildTimeline(result.value ?? { hops: [], reached: false }, VIEWER_ID))
  const summary = computed(() => (result.value ? summarizeTrace(result.value) : null))
  const frame = computed(() => frameAt(timeline.value, playback.value.elapsedMs))
  const drawing = computed<TraceDrawing | undefined>(() => {
    if (!result.value || !result.value.hops.length) return undefined
    const hops = result.value.hops.map((h) => h.base_url)
    const ended = playback.value.status === 'finished' && !result.value.reached
    return { path: [VIEWER_ID, ...hops], frame: frame.value, stoppedAt: ended ? hops[hops.length - 1] : undefined }
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
      const res = await runTrace({ entry: entry.value, target: options.target.value ?? '', traceFn: options.traceFn })
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

  function clear() {
    epoch++
    halt()
    result.value = null
    error.value = null
    loading.value = false
    playback.value = idlePlayback(playback.value.speed)
  }

  onScopeDispose(halt)

  return { entryInput, entry, result, error, loading, playback, timeline, summary, frame, drawing, trace, replay, togglePause, changeSpeed, clear }
}
