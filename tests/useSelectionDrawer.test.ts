import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSelectionDrawer } from '../src/composables/useSelectionDrawer'

function make() {
  const selected = ref<string | undefined>()
  const detail = ref<{ title: string } | null>(null)
  const scope = effectScope()
  const api = scope.run(() => useSelectionDrawer(selected, detail))!
  return { selected, detail, api, scope }
}

describe('useSelectionDrawer', () => {
  it('is open exactly while there is a detail', () => {
    const { api, detail } = make()
    expect(api.isOpen()).toBe(false)
    detail.value = { title: 'a' }
    expect(api.isOpen()).toBe(true)
    detail.value = null
    expect(api.isOpen()).toBe(false)
  })

  it('close deselects the node', () => {
    const { api, selected } = make()
    selected.value = 'http://a'
    api.close()
    expect(selected.value).toBeUndefined()
  })

  it('keeps the last detail so the content survives the slide out', async () => {
    const { api, detail } = make()
    detail.value = { title: 'a' }
    await nextTick()
    detail.value = null
    await nextTick()
    expect(api.shown.value).toEqual({ title: 'a' })
    detail.value = { title: 'b' }
    await nextTick()
    expect(api.shown.value).toEqual({ title: 'b' })
  })
})
