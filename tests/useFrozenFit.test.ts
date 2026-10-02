import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useFrozenFit } from '../src/composables/useFrozenFit'
import { fitView } from '../src/utils/viewport'
import type { Point } from '../src/utils/layout'

const make = () => {
  const positions = ref<Record<string, Point>>({ a: { x: 0, y: 0 }, b: { x: 100, y: 50 } })
  const fit = useFrozenFit(() => fitView(positions.value, 800, 600))
  return { positions, fit }
}

describe('useFrozenFit', () => {
  it('follows the fit while nothing is dragged', () => {
    const { positions, fit } = make()
    const before = fit.fitted()
    positions.value = { ...positions.value, b: { x: 900, y: 50 } }
    expect(fit.fitted()).not.toEqual(before)
  })

  it('holds the view still while a node is dragged far outside the old bounds, so nothing rescales under the pointer', () => {
    const { positions, fit } = make()
    fit.freeze()
    const held = fit.fitted()
    positions.value = { ...positions.value, b: { x: 2000, y: -900 } }
    expect(fit.fitted()).toEqual(held)
  })

  it('re-fits to the new positions once released', () => {
    const { positions, fit } = make()
    fit.freeze()
    positions.value = { ...positions.value, b: { x: 2000, y: -900 } }
    fit.release()
    expect(fit.fitted()).toEqual(fitView(positions.value, 800, 600))
  })
})
