import { ref } from 'vue'
import type { Ref } from 'vue'

/** Which tab is showing. */
export function useTabs<Id extends string>(initial: Id) {
  const active = ref(initial) as Ref<Id>
  return {
    active,
    select(id: Id) {
      active.value = id
    },
  }
}
