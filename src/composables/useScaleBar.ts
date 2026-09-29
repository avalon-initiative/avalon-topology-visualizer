import { computed } from 'vue'
import type { Ref } from 'vue'
import type { Layout } from '../utils/layout'
import { scaleBar } from '../utils/viewport'
import type { View } from '../utils/viewport'

/** The scale bar for the view actually on screen, so it stays true at every pan and zoom. */
export function useScaleBar(layout: Ref<Layout | null>, view: Ref<View>) {
  return computed(() => (layout.value ? scaleBar(layout.value.pxPerMs, view.value) : { px: 0, ms: 0 }))
}
