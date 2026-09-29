import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSelectionDrawer } from '../src/composables/useSelectionDrawer'

function make() {
  const selected = ref<string | undefined>()
  const detail = ref<{ title: string } | null>(null)
  const listeners = new Map<string, EventListener>()
  const target = {
    addEventListener: (type: string, l: EventListener) => listeners.set(type, l),
    removeEventListener: (type: string) => listeners.delete(type),
  }
  const scope = effectScope()
  const api = scope.run(() => useSelectionDrawer(selected, detail, target as never))!
  return { selected, detail, api, listeners, scope, target }
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

  describe('Escape', () => {
    const press = (l: EventListener | undefined, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...init })
      l?.(e)
      return e
    }

    it('closes an open drawer', () => {
      const { api, selected, detail, listeners } = make()
      selected.value = 'http://a'
      detail.value = { title: 'a' }
      expect(api.isOpen()).toBe(true)
      press(listeners.get('keydown'))
      expect(selected.value).toBeUndefined()
    })

    it('does nothing while closed, for other keys, or when something else already handled it', () => {
      const { selected, detail, listeners } = make()
      selected.value = 'http://a'
      press(listeners.get('keydown'))
      expect(selected.value).toBe('http://a')
      detail.value = { title: 'a' }
      press(listeners.get('keydown'), { key: 'Enter' })
      expect(selected.value).toBe('http://a')
      const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      handled.preventDefault()
      listeners.get('keydown')?.(handled)
      expect(selected.value).toBe('http://a')
    })

    it('stops listening when its scope ends', () => {
      const { scope, listeners } = make()
      expect(listeners.has('keydown')).toBe(true)
      scope.stop()
      expect(listeners.has('keydown')).toBe(false)
    })
  })
})
