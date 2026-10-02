import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useShardOutlines } from '../src/composables/useShardOutlines'

const key = ref([
  { id: 'core', color: 0, universal: true },
  { id: 'mine', color: 1, universal: false },
])

describe('useShardOutlines', () => {
  it('hides a shard every node is in by default and outlines the rest', () => {
    const o = useShardOutlines(key)
    expect(o.items.value.map((i) => [i.id, i.shown])).toEqual([['core', false], ['mine', true]])
    expect(o.outlined.value.map((i) => i.id)).toEqual(['mine'])
  })

  it('toggles either way, and keeps the choice when the key is recomputed', () => {
    const o = useShardOutlines(key)
    o.toggle('core')
    o.toggle('mine')
    expect(o.outlined.value.map((i) => i.id)).toEqual(['core'])
    key.value = key.value.map((k) => ({ ...k }))
    expect(o.outlined.value.map((i) => i.id)).toEqual(['core'])
  })

  it('ignores a shard that is not in the graph', () => {
    const o = useShardOutlines(key)
    o.toggle('gone')
    expect(o.items.value).toHaveLength(2)
  })
})
