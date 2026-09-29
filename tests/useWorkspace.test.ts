import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useWorkspace } from '../src/composables/useWorkspace'

describe('useWorkspace', () => {
  it('starts with the time-lapse tab, the legend closed and the walk form open', () => {
    const w = effectScope().run(() => useWorkspace())!
    expect(w.tabs.active.value).toBe('timelapse')
    expect(w.legend.open.value).toBe(false)
    expect(w.controls.open.value).toBe(true)
  })

  it('reveal opens the sidebar on the requested tab', () => {
    const w = effectScope().run(() => useWorkspace())!
    w.sidebar.hide()
    w.reveal('trace')
    expect(w.tabs.active.value).toBe('trace')
    expect(w.sidebar.open.value).toBe(true)
  })

  it('folds the walk form once there is a graph and unfolds it when the graph goes', async () => {
    const has = ref(false)
    const w = effectScope().run(() => useWorkspace(() => has.value))!
    has.value = true
    await nextTick()
    expect(w.controls.open.value).toBe(false)
    has.value = false
    await nextTick()
    expect(w.controls.open.value).toBe(true)
  })
})
