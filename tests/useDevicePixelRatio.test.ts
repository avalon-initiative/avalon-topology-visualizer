import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useDevicePixelRatio } from '../src/composables/useDevicePixelRatio'

afterEach(() => vi.unstubAllGlobals())

describe('useDevicePixelRatio', () => {
  it('reads the ratio and refreshes it on resize', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const scope = effectScope()
    const ratio = scope.run(() => useDevicePixelRatio())!
    expect(ratio.value).toBe(2)
    vi.stubGlobal('devicePixelRatio', 1.5)
    window.dispatchEvent(new Event('resize'))
    expect(ratio.value).toBe(1.5)
    scope.stop()
    vi.stubGlobal('devicePixelRatio', 3)
    window.dispatchEvent(new Event('resize'))
    expect(ratio.value).toBe(1.5)
  })

  it('falls back to 1 when the ratio is missing or invalid', () => {
    vi.stubGlobal('devicePixelRatio', 0)
    expect(effectScope().run(() => useDevicePixelRatio())!.value).toBe(1)
  })
})
