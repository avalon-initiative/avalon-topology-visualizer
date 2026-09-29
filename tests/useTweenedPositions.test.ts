import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTweenedPositions } from '../src/composables/useTweenedPositions'
import type { Point } from '../src/utils/layout'

let frames: ((now: number) => void)[] = []
let clock = 0

function make(initial: Record<string, Point> | undefined, animate: boolean) {
  const target = ref(initial)
  const on = ref(animate)
  const scope = effectScope()
  const api = scope.run(() => useTweenedPositions(target, on, 720, 480, 100))!
  return { target, on, api, scope }
}

const runFrame = (t: number) => {
  clock = t
  const due = frames
  frames = []
  due.forEach((f) => f(t))
}

describe('useTweenedPositions', () => {
  beforeEach(() => {
    frames = []
    clock = 0
    vi.stubGlobal('requestAnimationFrame', (f: (n: number) => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = []
    })
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('refits the view when the (reactive) canvas size changes', () => {
    const width = ref(720)
    const scope = effectScope()
    const api = scope.run(() => useTweenedPositions(ref({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }), ref(false), width, () => 480))!
    const before = api.view.value
    width.value = 1440
    expect(api.view.value.tx).toBeGreaterThan(before.tx)
  })

  it('follows the target at once when not animating', async () => {
    const { target, api } = make({ a: { x: 0, y: 0 } }, false)
    target.value = { a: { x: 10, y: 10 } }
    await nextTick()
    expect(api.positions.value.a).toEqual({ x: 10, y: 10 })
    expect(frames).toHaveLength(0)
  })

  it('eases to the target over its duration when animating, then lands exactly', async () => {
    const { target, api } = make({ a: { x: 0, y: 0 } }, true)
    target.value = { a: { x: 100, y: 0 } }
    await nextTick()
    expect(api.positions.value.a.x).toBe(0)
    runFrame(50)
    expect(api.positions.value.a.x).toBeCloseTo(50, 5)
    runFrame(100)
    expect(api.positions.value.a).toEqual({ x: 100, y: 0 })
    expect(frames).toHaveLength(0)
  })

  it('restarts from what is drawn when the target changes mid-flight', async () => {
    const { target, api } = make({ a: { x: 0, y: 0 } }, true)
    target.value = { a: { x: 100, y: 0 } }
    await nextTick()
    runFrame(50)
    const drawn = api.positions.value.a.x
    target.value = { a: { x: 0, y: 0 } }
    await nextTick()
    expect(api.positions.value.a.x).toBe(drawn)
    runFrame(100)
    runFrame(400)
    expect(api.positions.value.a).toEqual({ x: 0, y: 0 })
  })

  it('snaps when there was nothing drawn yet, or the target goes away', async () => {
    const { target, api } = make(undefined, true)
    target.value = { a: { x: 5, y: 5 } }
    await nextTick()
    expect(api.positions.value.a).toEqual({ x: 5, y: 5 })
    target.value = undefined
    await nextTick()
    expect(api.positions.value).toEqual({})
  })

  it('fits the view to the drawn positions and cancels on dispose', async () => {
    const { target, api, scope } = make({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, true)
    expect(api.view.value.scale).toBeGreaterThan(0)
    target.value = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }
    await nextTick()
    scope.stop()
    expect(frames).toHaveLength(0)
  })
})
