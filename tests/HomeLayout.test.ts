import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, node } from './graphs'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology, traceRoute } = vi.hoisted(() => ({ walkTopology: vi.fn(), traceRoute: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  fetchTrustAnchors: vi.fn(async () => []),
  walkTopology,
  traceRoute,
}))

import Home from '../src/views/Home.vue'
import { reached } from './traces'

let resizeCallbacks: ((entries: { contentRect: { width: number; height: number } }[]) => void)[] = []
class FakeResizeObserver {
  constructor(cb: (typeof resizeCallbacks)[number]) {
    resizeCallbacks.push(cb)
  }
  observe() {}
  disconnect() {}
}

async function walked() {
  const wrapper = mount(Home, { attachTo: document.body })
  const [seed, refresh] = wrapper.findAll('input[type="text"]')
  await seed.setValue('http://a')
  await refresh.setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}
const canvas = (w: ReturnType<typeof mount>) => w.findComponent({ name: 'TopologyCanvas' })
const select = async (w: ReturnType<typeof mount>, url: string | undefined) => {
  canvas(w).vm.$emit('select', url)
  await flushPromises()
}

describe('Home layout', () => {
  beforeEach(() => {
    resizeCallbacks = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
    walkTopology.mockResolvedValue(graph([node('http://a'), node('http://b')], [edge('http://a', 'http://b', 'active', 20)]))
    traceRoute.mockResolvedValue(reached())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('puts the tools in a sidebar with one tab per section, the time-lapse first', async () => {
    const w = await walked()
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs.map((t) => t.replace(/\d+$/, ''))).toEqual(['Time-lapse', 'Measure', 'Trace', 'Alerts'])
    expect(w.get('#tool-sidebar').findAll('[role="tabpanel"]')).toHaveLength(4)
    w.unmount()
  })

  it('shows one tool at a time and switches on click', async () => {
    const w = await walked()
    const visible = () => w.findAll('[role="tabpanel"]').filter((p) => (p.element as HTMLElement).style.display !== 'none')
    expect(visible()).toHaveLength(1)
    expect(visible()[0].find('[data-testid="timeline"]').exists()).toBe(true)
    await w.findAll('[role="tab"]').find((t) => t.text() === 'Trace')!.trigger('click')
    expect(visible()).toHaveLength(1)
    expect(visible()[0].find('[data-testid="trace-panel"]').exists()).toBe(true)
    w.unmount()
  })

  it('leaves everything but the time-lapse disabled until there is a graph', () => {
    const w = mount(Home)
    const tabs = w.findAll('[role="tab"]')
    expect(tabs[0].attributes('disabled')).toBeUndefined()
    for (const t of tabs.slice(1)) expect(t.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Choose a network to walk')
  })

  it('hides and shows the sidebar from the top bar', async () => {
    const w = await walked()
    const side = () => (w.get('#tool-sidebar').element as HTMLElement).style.display
    expect(side()).toBe('')
    await w.findAll('button').find((b) => b.text() === 'Hide tools')!.trigger('click')
    expect(side()).toBe('none')
    await w.findAll('button').find((b) => b.text() === 'Show tools')!.trigger('click')
    expect(side()).toBe('')
    w.unmount()
  })

  it('keeps the legend closed until toggled, and the scale bar always visible', async () => {
    const w = await walked()
    const legend = () => (w.get('#legend-panel').element as HTMLElement).style.display
    expect(legend()).toBe('none')
    expect(w.find('[data-testid="scale-bar"]').exists()).toBe(true)
    await w.findAll('button').find((b) => b.text() === 'Show legend')!.trigger('click')
    expect(legend()).toBe('')
    await w.findAll('button').find((b) => b.text() === 'Hide legend')!.trigger('click')
    expect(legend()).toBe('none')
    w.unmount()
  })

  it('sizes the canvas to the stage and follows resizes without moving the nodes', async () => {
    const w = await walked()
    const before = { ...(canvas(w).props('positions') as Record<string, unknown>) }
    resizeCallbacks.at(-1)!([{ contentRect: { width: 1200, height: 700 } }])
    await flushPromises()
    expect(canvas(w).props('width')).toBe(1200)
    expect(canvas(w).props('height')).toBe(700)
    expect(canvas(w).props('positions')).toEqual(before)
    const view = canvas(w).props('view')
    resizeCallbacks.at(-1)!([{ contentRect: { width: 600, height: 400 } }])
    await flushPromises()
    expect(canvas(w).props('view')).not.toEqual(view)
    w.unmount()
  })

  describe('detail drawer', () => {
    const drawer = (w: ReturnType<typeof mount>) => w.find('[data-testid="detail-drawer"]')

    it('opens with the selected node facts and closes when the selection clears', async () => {
      const w = await walked()
      expect(drawer(w).exists()).toBe(false)
      await select(w, 'http://b')
      expect(drawer(w).text()).toContain('http://b')
      expect(drawer(w).text()).toContain('Hops from the seed')
      await select(w, undefined)
      expect(drawer(w).exists()).toBe(false)
      w.unmount()
    })

    it('takes room beside the map instead of floating over it', async () => {
      const w = await walked()
      await select(w, 'http://b')
      const stage = canvas(w).element.parentElement!
      expect(stage.contains(drawer(w).element)).toBe(false)
      expect(stage.parentElement?.parentElement).toBe(drawer(w).element.closest('main'))
      w.unmount()
    })

    it('makes the tools step aside on narrow screens while the drawer is open', async () => {
      const w = await walked()
      const side = () => w.get('#tool-sidebar').classes().join(' ')
      expect(side()).not.toMatch(/yields/)
      await select(w, 'http://b')
      expect(side()).toMatch(/yields/)
      await select(w, undefined)
      expect(side()).not.toMatch(/yields/)
      w.unmount()
    })

    it('closes with its close button and on Escape', async () => {
      const w = await walked()
      await select(w, 'http://b')
      await w.get('button[aria-label="Close node details"]').trigger('click')
      expect(drawer(w).exists()).toBe(false)
      await select(w, 'http://b')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(drawer(w).exists()).toBe(false)
      w.unmount()
    })

    it('does not slide when motion is reduced, and slides otherwise', async () => {
      const w = await walked()
      const transition = () => w.findComponent({ name: 'Transition' })
      expect(transition().props('css')).toBe(true)
      await w.get('[data-testid="motion-toggle"] input').setValue(true)
      expect(transition().props('css')).toBe(false)
      w.unmount()
    })

    it('traces to the node from the drawer and reveals the trace tool', async () => {
      const w = await walked()
      await select(w, 'http://b')
      await drawer(w).findAll('button').find((b) => b.text() === 'Trace to this node')!.trigger('click')
      await flushPromises()
      expect(traceRoute).toHaveBeenCalledWith('http://a', 'http://b', { ttl: 12 })
      expect(w.get('[role="tab"][aria-selected="true"]').text()).toBe('Trace')
      w.unmount()
    })

    it('picks probe ends from the drawer and reveals the measure tool', async () => {
      const w = await walked()
      await select(w, 'http://b')
      await drawer(w).findAll('button').find((b) => b.text() === 'Use as probe first')!.trigger('click')
      expect(w.get('[data-testid="probe-from"]').text()).toContain('b')
      expect(w.get('[role="tab"][aria-selected="true"]').text()).toBe('Measure')
      // The node is now the first end, so it cannot also be the second.
      expect(drawer(w).findAll('button').find((b) => b.text() === 'Use as probe second')!.attributes('disabled')).toBeDefined()
      expect(drawer(w).findAll('button').find((b) => b.text() === 'Use as probe first')!.attributes('disabled')).toBeUndefined()
      w.unmount()
    })

    it('will not offer a node as first when it is already the second', async () => {
      const w = await walked()
      await select(w, 'http://b')
      await drawer(w).findAll('button').find((b) => b.text() === 'Use as probe second')!.trigger('click')
      expect(drawer(w).findAll('button').find((b) => b.text() === 'Use as probe first')!.attributes('disabled')).toBeDefined()
      w.unmount()
    })
  })

  it('shows the summary stats compactly in the top bar', async () => {
    const w = await walked()
    const stats = w.get('[data-testid="summary"]').text()
    expect(stats).toMatch(/Nodes visited\s*2/)
    expect(stats).toMatch(/Links\s*1/)
    w.unmount()
  })
})
