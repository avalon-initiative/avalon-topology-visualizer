import { ref } from 'vue'
import type { View } from '../utils/viewport'

/**
 * The auto-fitted view, held still while a node is being dragged. The fit follows the nodes' bounding box, so left
 * live it rescales and recentres under the pointer on every move and the whole graph appears to flip.
 */
export function useFrozenFit(fitted: () => View) {
  const frozen = ref<View | undefined>()
  return {
    fitted: () => frozen.value ?? fitted(),
    freeze() {
      frozen.value = fitted()
    },
    release() {
      frozen.value = undefined
    },
  }
}
