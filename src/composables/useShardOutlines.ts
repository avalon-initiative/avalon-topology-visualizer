import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { ShardKeyItem } from '../utils/shardGroups'

export interface ShardLegendItem extends ShardKeyItem {
  shown: boolean
}

/** Which shard outlines are drawn: a shard every node is in starts hidden (it only wraps the whole graph); a click on its legend mark overrides that either way. */
export function useShardOutlines(key: Ref<ShardKeyItem[]>) {
  const overrides = ref<Record<string, boolean>>({})
  const items = computed<ShardLegendItem[]>(() => key.value.map((k) => ({ ...k, shown: overrides.value[k.id] ?? !k.universal })))
  const outlined = computed(() => items.value.filter((i) => i.shown))
  function toggle(id: string) {
    const now = items.value.find((i) => i.id === id)
    if (now) overrides.value = { ...overrides.value, [id]: !now.shown }
  }
  return { items, outlined, toggle }
}
