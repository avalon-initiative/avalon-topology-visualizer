import { computed, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { computeLayout } from '../utils/layout'
import type { Layout, LayoutLink, Point } from '../utils/layout'
import { toLayoutInput } from '../utils/layoutInput'
import type { MergedGraph } from '../utils/mergeGraph'
import { fitView } from '../utils/viewport'
import { INITIAL_SIZE } from './useElementSize'
import type { Size } from './useElementSize'

/** Lays out the merged graph (independent of the canvas size, which only fits the view), warm-starting each refresh from the last layout and honouring pins. */
export function useLayout(merged: Ref<MergedGraph | null>, extraLinks?: Ref<LayoutLink[]>, size: Ref<Size> = shallowRef(INITIAL_SIZE)) {
  const layout = shallowRef<Layout | null>(null)
  const pins = shallowRef<Record<string, Point>>({})

  function recompute() {
    if (!merged.value) {
      layout.value = null
      return
    }
    const { nodeIds, links } = toLayoutInput(merged.value, extraLinks?.value)
    layout.value = computeLayout(nodeIds, links, pins.value, layout.value ?? undefined)
  }

  watch(extraLinks ? [merged, extraLinks] : merged, recompute, { immediate: true })

  function pin(id: string, at: Point) {
    pins.value = { ...pins.value, [id]: at }
    recompute()
  }

  function unpin(id: string) {
    pins.value = Object.fromEntries(Object.entries(pins.value).filter(([key]) => key !== id))
    recompute()
  }

  const view = computed(() => fitView(layout.value?.positions ?? {}, size.value.width, size.value.height))
  const pinned = computed(() => new Set(Object.keys(pins.value)))

  return { layout, pins, pinned, view, pin, unpin }
}
