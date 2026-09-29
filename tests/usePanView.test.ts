import { describe, expect, it } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import { usePanView } from '../src/composables/usePanView'
import type { Point } from '../src/utils/layout'
import { fitView } from '../src/utils/viewport'

function make(initial: Record<string, Point> = { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } }) {
  const positions = shallowRef(initial)
  const size = ref({ width: 400, height: 300 })
  const api = effectScope().run(() => usePanView({ fitted: () => fitView(positions.value, size.value.width, size.value.height), positions: () => positions.value, size: () => size.value }))!
  return { api, positions, size }
}

describe('usePanView', () => {
  it('starts unpanned, with the fitted view', () => {
    const { api, positions } = make()
    expect(api.panned.value).toBe(false)
    expect(api.view.value).toEqual(fitView(positions.value, 400, 300))
  })

  it('accumulates deltas on top of the fitted view without changing the scale', () => {
    const { api, positions } = make()
    const fitted = fitView(positions.value, 400, 300)
    api.panBy(10, -5)
    api.panBy(5, -5)
    expect(api.pan.value).toEqual({ dx: 15, dy: -10 })
    expect(api.view.value).toEqual({ scale: fitted.scale, tx: fitted.tx + 15, ty: fitted.ty - 10 })
    expect(api.panned.value).toBe(true)
  })

  it('resets to zero', () => {
    const { api } = make()
    api.panBy(20, 20)
    api.reset()
    expect(api.panned.value).toBe(false)
  })

  it('cannot be dragged out of reach, and reversing does not need to unwind hidden distance', () => {
    const { api } = make()
    api.panBy(-100000, 0)
    const far = api.pan.value.dx
    expect(far).toBeGreaterThan(-400)
    api.panBy(10, 0)
    expect(api.pan.value.dx).toBe(far + 10)
  })

  it('keeps the offset across a layout change and a stage resize', () => {
    const { api, positions, size } = make()
    api.panBy(30, 20)
    positions.value = { a: { x: 0, y: 0 }, b: { x: 120, y: 60 }, c: { x: 40, y: 90 } }
    expect(api.pan.value).toEqual({ dx: 30, dy: 20 })
    size.value = { width: 300, height: 300 }
    expect(api.pan.value).toEqual({ dx: 30, dy: 20 })
  })

  it('keeps the offset while the graph is momentarily empty', () => {
    const { api, positions } = make()
    api.panBy(30, 20)
    const before = positions.value
    positions.value = {}
    expect(api.panned.value).toBe(false)
    positions.value = before
    expect(api.pan.value).toEqual({ dx: 30, dy: 20 })
  })

  it('re-clamps when the stage shrinks so the graph stays reachable', () => {
    const { api, size } = make()
    api.panBy(150, 0)
    size.value = { width: 120, height: 300 }
    expect(api.pan.value.dx).toBeLessThan(150)
  })
})
