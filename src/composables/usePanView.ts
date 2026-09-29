import { computed, ref } from 'vue'
import type { Point } from '../utils/layout'
import { applyPan, clampPan, isPanned, NO_PAN } from '../utils/pan'
import type { Pan } from '../utils/pan'
import type { View } from '../utils/viewport'

export interface PanSources {
  /** The auto-fitted view; the pan rides on top of it. */
  fitted: () => View
  positions: () => Record<string, Point>
  size: () => { width: number; height: number }
}

/**
 * A user pan over the auto-fitted view. The offset is screen pixels and is kept when the layout tweens, the walk
 * refreshes or the stage resizes (the graph then re-centres and the same offset applies to the new centre).
 */
export function usePanView(s: PanSources) {
  const offset = ref<Pan>(NO_PAN)
  const clamp = (pan: Pan) => clampPan(pan, s.positions(), s.fitted(), s.size())
  // Re-clamped on read so a shrunken stage or a smaller graph cannot leave the graph out of reach.
  const pan = computed(() => clamp(offset.value))
  const view = computed(() => applyPan(s.fitted(), pan.value))

  return {
    view,
    pan,
    panned: computed(() => isPanned(pan.value)),
    panBy(dx: number, dy: number) {
      offset.value = clamp({ dx: pan.value.dx + dx, dy: pan.value.dy + dy })
    },
    /** Sets the offset (clamped), for callers that compute a pan themselves, such as zoom about a point. */
    panTo(next: Pan) {
      offset.value = clamp(next)
    },
    reset() {
      offset.value = NO_PAN
    },
  }
}
