import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TopologyCanvas from '../src/components/TopologyCanvas.vue'

const calls: string[] = []
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key: string) => (typeof key === 'string' && key !== 'then' ? (..._a: unknown[]) => calls.push(key) : undefined),
  set: () => true,
})

const props = () => ({
  positions: { 'http://a': { x: 0, y: 0 }, 'http://b': { x: 100, y: 0 } },
  links: [{ a: 'http://a', b: 'http://b' }],
  pinned: new Set<string>(),
  view: { scale: 1, tx: 200, ty: 150 },
  width: 400,
  height: 300,
})

// jsdom has no PointerEvent, so dispatch plain mouse events under the pointer event names.
const fire = async (el: { element: Element }, type: string, x: number, y: number) => {
  el.element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
  await flushPromises()
}

beforeEach(() => {
  calls.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
})
afterEach(() => vi.restoreAllMocks())

describe('TopologyCanvas', () => {
  it('draws the graph on mount, and again when the positions change', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    await flushPromises()
    expect(calls.filter((c) => c === 'clearRect')).toHaveLength(1)
    expect(calls.filter((c) => c === 'arc')).toHaveLength(2)
    await wrapper.setProps({ positions: { 'http://a': { x: 5, y: 5 }, 'http://b': { x: 90, y: 0 }, 'http://c': { x: 0, y: 60 } } })
    expect(calls.filter((c) => c === 'clearRect')).toHaveLength(2)
  })

  it('is sized to the given dimensions and described for assistive tech', () => {
    const canvas = mount(TopologyCanvas, { props: props() }).find('canvas')
    expect(canvas.attributes('width')).toBe('400')
    expect(canvas.attributes('height')).toBe('300')
    expect(canvas.attributes('role')).toBe('img')
    expect(canvas.attributes('aria-label')).toMatch(/pin/i)
  })

  it('pins a node at the dragged world position', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 300, 150)
    await fire(canvas, 'pointermove', 350, 200)
    await fire(canvas, 'pointerup', 350, 200)
    expect(wrapper.emitted('pin')).toEqual([['http://b', { x: 150, y: 50 }]])
  })

  it('stops pinning once the pointer is released', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 300, 150)
    await fire(canvas, 'pointerup', 300, 150)
    await fire(canvas, 'pointermove', 350, 200)
    expect(wrapper.emitted('pin')).toBeUndefined()
  })

  it('does nothing when the pointer goes down on empty space', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 20, 20)
    await fire(canvas, 'pointermove', 60, 60)
    expect(wrapper.emitted('pin')).toBeUndefined()
  })

  it('releases a pin on double-click of that node only', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'dblclick', 200, 150)
    await fire(canvas, 'dblclick', 20, 20)
    expect(wrapper.emitted('unpin')).toEqual([['http://a']])
  })

  it('selects a node on a click without pinning it', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 300, 150)
    await fire(canvas, 'pointerup', 300, 150)
    expect(wrapper.emitted('select')).toEqual([['http://b']])
    expect(wrapper.emitted('pin')).toBeUndefined()
  })

  it('treats a tiny wobble as a click, not a drag', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 300, 150)
    await fire(canvas, 'pointermove', 302, 151)
    await fire(canvas, 'pointerup', 302, 151)
    expect(wrapper.emitted('pin')).toBeUndefined()
    expect(wrapper.emitted('select')).toEqual([['http://b']])
  })

  it('does not select when a node is dragged', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 300, 150)
    await fire(canvas, 'pointermove', 340, 190)
    await fire(canvas, 'pointerup', 340, 190)
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('pin')).toHaveLength(1)
  })

  it('clears the selection when empty space is clicked', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    const canvas = wrapper.find('canvas')
    await fire(canvas, 'pointerdown', 20, 20)
    await fire(canvas, 'pointerup', 20, 20)
    expect(wrapper.emitted('select')).toEqual([[undefined]])
  })

  it('redraws when the selection changes', async () => {
    const wrapper = mount(TopologyCanvas, { props: props() })
    await flushPromises()
    const before = calls.filter((c) => c === 'clearRect').length
    await wrapper.setProps({ selected: 'http://a' })
    expect(calls.filter((c) => c === 'clearRect').length).toBe(before + 1)
  })

  it('does not fail when the canvas has no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => mount(TopologyCanvas, { props: props() })).not.toThrow()
  })
})
