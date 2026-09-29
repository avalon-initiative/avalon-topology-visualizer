import { onScopeDispose, ref } from 'vue'

/** The window's device pixel ratio, refreshed on resize (browser zoom and moving between screens both fire it). */
export function useDevicePixelRatio() {
  const read = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1)
  const ratio = ref(read())
  const update = () => {
    ratio.value = read()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', update)
    onScopeDispose(() => window.removeEventListener('resize', update))
  }
  return ratio
}
