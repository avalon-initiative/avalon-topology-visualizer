import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { INITIAL_SIZE, useElementSize } from '../src/composables/useElementSize'

type Callback = (entries: { contentRect: { width: number; height: number } }[]) => void
let observers: { cb: Callback; observed: Element[]; disconnected: boolean }[] = []

class FakeResizeObserver {
  record: (typeof observers)[number]
  constructor(cb: Callback) {
    this.record = { cb, observed: [], disconnected: false }
    observers.push(this.record)
  }
  observe(el: Element) {
    this.record.observed.push(el)
  }
  disconnect() {
    this.record.disconnected = true
  }
}

const box = (w: number, h: number) => {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: w })
  Object.defineProperty(el, 'clientHeight', { value: h })
  return el
}
const resize = (w: number, h: number) => observers.at(-1)!.cb([{ contentRect: { width: w, height: h } }])

function make(el: HTMLElement | null) {
  const target = ref<HTMLElement | null>(el)
  const scope = effectScope()
  const api = scope.run(() => useElementSize(target))!
  return { target, api, scope }
}

describe('useElementSize', () => {
  beforeEach(() => {
    observers = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts from the fallback size until an element is measured', () => {
    expect(make(null).api.size.value).toEqual(INITIAL_SIZE)
  })

  it('measures the element straight away and observes it', async () => {
    const el = box(1000, 600)
    const { api } = make(el)
    await nextTick()
    expect(api.size.value).toEqual({ width: 1000, height: 600 })
    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([el])
  })

  it('follows resizes, rounded to whole pixels', async () => {
    const { api } = make(box(1000, 600))
    await nextTick()
    resize(812.4, 411.6)
    expect(api.size.value).toEqual({ width: 812, height: 412 })
  })

  it('ignores an empty box (hidden or collapsed) and keeps the last size', async () => {
    const { api } = make(box(1000, 600))
    await nextTick()
    resize(0, 0)
    resize(500, 0)
    expect(api.size.value).toEqual({ width: 1000, height: 600 })
  })

  it('does not replace the size object when nothing changed', async () => {
    const { api } = make(box(1000, 600))
    await nextTick()
    const before = api.size.value
    resize(1000, 600)
    expect(api.size.value).toBe(before)
  })

  it('picks up an element that is mounted later, and stops observing the old one', async () => {
    const { target, api } = make(null)
    await nextTick()
    expect(observers).toHaveLength(0)
    target.value = box(300, 200)
    await nextTick()
    expect(api.size.value).toEqual({ width: 300, height: 200 })
    target.value = null
    await nextTick()
    expect(observers[0].disconnected).toBe(true)
  })

  it('disconnects when its scope ends', async () => {
    const { scope } = make(box(10, 10))
    await nextTick()
    scope.stop()
    expect(observers[0].disconnected).toBe(true)
  })

  it('still measures once where there is no ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { api } = make(box(640, 360))
    await nextTick()
    expect(api.size.value).toEqual({ width: 640, height: 360 })
  })
})
