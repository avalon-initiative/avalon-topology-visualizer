import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Point } from '../utils/layout'
import { interpolatePositions } from '../utils/tween'
import { fitView } from '../utils/viewport'

export const TWEEN_MS = 600

/**
 * The positions to draw. Follows `target` at once, or eases from the drawn positions to the new ones
 * when `animate` is on at the moment the target changes. The view is fitted to what is drawn.
 */
export function useTweenedPositions(
  target: Ref<Record<string, Point> | undefined>,
  animate: Ref<boolean>,
  width: MaybeRefOrGetter<number>,
  height: MaybeRefOrGetter<number>,
  durationMs = TWEEN_MS,
) {
  const positions = shallowRef<Record<string, Point>>(target.value ?? {})
  let frame = 0

  function cancel() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  watch(target, (to) => {
    cancel()
    const from = positions.value
    if (!to || !animate.value || durationMs <= 0 || Object.keys(from).length === 0) {
      positions.value = to ?? {}
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = (now - start) / durationMs
      if (t >= 1) {
        frame = 0
        positions.value = to
        return
      }
      positions.value = interpolatePositions(from, to, t)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  })

  onScopeDispose(cancel)

  const view = computed(() => fitView(positions.value, toValue(width), toValue(height)))
  return { positions, view }
}
