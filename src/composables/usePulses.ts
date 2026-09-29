import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { MergedGraph } from '../utils/mergeGraph'
import { diffGraphs, pulsedLinkKeys, pulseProgress, PULSE_DURATION_MS } from '../utils/pulses'
import type { Pulse, PulseDrawing } from '../utils/pulses'

export interface PulseClock {
  now: () => number
  request: (cb: () => void) => number
  cancel: (id: number) => void
}

const browserClock: PulseClock = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
}

/**
 * Pulses for what changed between the previous and the new merged graph. They animate once, or with reduced
 * motion stay as static indicators until the next refresh replaces them.
 */
export function usePulses(merged: Ref<MergedGraph | null>, reduced: Ref<boolean>, clock: PulseClock = browserClock, durationMs = PULSE_DURATION_MS) {
  const pulses = shallowRef<Pulse[]>([])
  const progress = ref<number | null>(null)
  const running = ref(false)
  let frame: number | undefined

  function halt() {
    if (frame !== undefined) clock.cancel(frame)
    frame = undefined
    running.value = false
  }

  function run() {
    halt()
    const start = clock.now()
    running.value = true
    const tick = () => {
      const p = pulseProgress(clock.now() - start, durationMs)
      progress.value = p
      if (p === null) return halt()
      frame = clock.request(tick)
    }
    tick()
  }

  watch(merged, (next, prev) => {
    halt()
    pulses.value = diffGraphs(prev ?? null, next)
    if (pulses.value.length > 0 && !reduced.value) run()
  })
  watch(reduced, (r) => {
    if (r) halt()
  })
  onScopeDispose(halt)

  const drawing = computed<PulseDrawing | undefined>(() => {
    if (pulses.value.length === 0) return undefined
    if (reduced.value) return { keys: pulsedLinkKeys(pulses.value), progress: null }
    return running.value ? { keys: pulsedLinkKeys(pulses.value), progress: progress.value } : undefined
  })

  return { pulses, drawing }
}
