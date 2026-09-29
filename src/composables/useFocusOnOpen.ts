import { nextTick, watch } from 'vue'
import type { Ref } from 'vue'

/** Moves focus to the element when `open` turns true, so keyboard and screen reader users land in a freshly opened drawer. */
export function useFocusOnOpen(open: () => boolean, target: Ref<HTMLElement | null>) {
  watch(open, async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    target.value?.focus({ preventScroll: true })
  })
}
