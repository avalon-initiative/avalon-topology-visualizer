import { computed, onScopeDispose, ref } from 'vue'
import { reducedMotion, toggledPreference } from '../utils/motion'
import type { MotionPreference } from '../utils/motion'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Reduced motion: follows the OS setting until the viewer flips the toggle. */
export function useMotion(match: (query: string) => MediaQueryList | undefined = (q) => globalThis.matchMedia?.(q)) {
  const preference = ref<MotionPreference>('system')
  const system = ref(false)
  const list = match(QUERY)
  system.value = list?.matches ?? false
  const listener = (e: MediaQueryListEvent) => {
    system.value = e.matches
  }
  list?.addEventListener?.('change', listener)
  onScopeDispose(() => list?.removeEventListener?.('change', listener))

  const reduced = computed(() => reducedMotion(preference.value, system.value))
  function toggle() {
    preference.value = toggledPreference(preference.value, system.value)
  }
  return { preference, reduced, toggle }
}
