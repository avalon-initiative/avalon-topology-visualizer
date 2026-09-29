import { ref } from 'vue'

/** Open/closed state for anything that can be collapsed. */
export function useDisclosure(initial = false) {
  const open = ref(initial)
  return {
    open,
    toggle: () => {
      open.value = !open.value
    },
    show: () => {
      open.value = true
    },
    hide: () => {
      open.value = false
    },
  }
}
