import { describe, expect, it } from 'vitest'
import { computed, effectScope, nextTick, ref, shallowRef } from 'vue'
import { useTopologyExtras } from '../src/composables/useTopologyExtras'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { describeNodes } from '../src/utils/nodeFacts'
import { edge, merged, reporting } from './extraGraphs'

const small = () => merged([reporting('http://a')])
const grown = () => merged([reporting('http://a'), reporting('http://b')], [edge('http://a', 'http://b')])

function setup(pulsesLive?: boolean) {
  const shown = shallowRef<MergedGraph | null>(small())
  const live = ref(pulsesLive ?? true)
  const extras = effectScope().run(() =>
    useTopologyExtras({
      merged: shown,
      facts: computed(() => (shown.value ? describeNodes(shown.value) : {})),
      positions: ref({}),
      linkStyles: ref([]),
      nodeStyles: ref({}),
      selected: ref(undefined),
      ...(pulsesLive === undefined ? {} : { pulsesLive: live }),
    }),
  )!
  return { shown, live, extras }
}

describe('useTopologyExtras pulses', () => {
  it('pulse when a live crawl gains a node between refreshes', async () => {
    const { shown, extras } = setup()
    shown.value = grown()
    await nextTick()
    expect(extras.pulse.value).toBeDefined()
  })

  it('pulse nothing when the shown graph changes only because a snapshot is being replayed', async () => {
    const { shown, live, extras } = setup(true)
    live.value = false
    await nextTick()
    shown.value = grown()
    await nextTick()
    expect(extras.pulse.value).toBeUndefined()
  })

  it('pulse nothing when returning to the live graph after a replay', async () => {
    const { shown, live, extras } = setup(true)
    live.value = false
    shown.value = grown()
    await nextTick()
    live.value = true
    await nextTick()
    expect(extras.pulse.value).toBeUndefined()
  })
})
