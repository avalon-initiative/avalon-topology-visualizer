import { shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * Drawer state for the selected node: open while a detail exists, deselects on request.
 * `shown` keeps the last detail so the drawer's content stays put while it slides out.
 */
export function useSelectionDrawer<T>(selected: Ref<string | undefined>, detail: Ref<T | null>) {
  const shown = shallowRef<T | null>(detail.value)
  watch(detail, (d) => {
    if (d) shown.value = d
  })

  const isOpen = () => detail.value !== null
  function close() {
    selected.value = undefined
  }

  return { isOpen, shown, close }
}
