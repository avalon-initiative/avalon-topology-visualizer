import { onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * Drawer state for the selected node: open while a detail exists, closes on Escape or on request.
 * `shown` keeps the last detail so the drawer's content stays put while it slides out.
 */
export function useSelectionDrawer<T>(selected: Ref<string | undefined>, detail: Ref<T | null>, target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {
  const shown = shallowRef<T | null>(detail.value)
  watch(detail, (d) => {
    if (d) shown.value = d
  })

  const isOpen = () => detail.value !== null
  function close() {
    selected.value = undefined
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen() && !e.defaultPrevented) close()
  }
  target.addEventListener('keydown', onKey as EventListener)
  onScopeDispose(() => target.removeEventListener('keydown', onKey as EventListener))

  return { isOpen, shown, close }
}
