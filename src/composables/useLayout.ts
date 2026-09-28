import { computed, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { computeLayout } from '../utils/layout'
import type { Layout, LayoutLink, Point } from '../utils/layout'
import { toLayoutInput } from '../utils/layoutInput'
import type { MergedGraph } from '../utils/mergeGraph'
import { fitView, scaleBar } from '../utils/viewport'

export const CANVAS_WIDTH = 720
export const CANVAS_HEIGHT = 480

/** Lays out the merged graph, warm-starting each refresh from the last layout and honouring pins. */
export function useLayout(merged: Ref<MergedGraph | null>, extraLinks?: Ref<LayoutLink[]>) {
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

  const view = computed(() => fitView(layout.value?.positions ?? {}, CANVAS_WIDTH, CANVAS_HEIGHT))
  const bar = computed(() => (layout.value ? scaleBar(layout.value.pxPerMs, view.value) : { px: 0, ms: 0 }))
  const pinned = computed(() => new Set(Object.keys(pins.value)))

  return { layout, pins, pinned, view, bar, pin, unpin }
}
