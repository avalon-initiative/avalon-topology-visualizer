import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, node } from './graphs'
import { reached } from './traces'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology, traceRoute } = vi.hoisted(() => ({ walkTopology: vi.fn(), traceRoute: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  walkTopology,
  traceRoute,
}))

import Home from '../src/views/Home.vue'

describe('Home trace', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
    walkTopology.mockResolvedValue(graph([node('http://a'), node('http://b'), node('http://c')], [edge('http://a', 'http://b', 'active', 20), edge('http://b', 'http://c', 'active', 10)]))
    traceRoute.mockResolvedValue(reached())
  })
  afterEach(() => vi.restoreAllMocks())

  it('traces from the seed to the selected node and shows the summary', async () => {
    const wrapper = mount(Home)
    const [seed, refresh] = wrapper.findAll('input[type="text"]')
    await seed.setValue('http://a')
    await refresh.setValue('0')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    wrapper.findComponent({ name: 'TopologyCanvas' }).vm.$emit('select', 'http://c')
    await flushPromises()
    const trace = wrapper.get('[data-testid="trace-panel"]')
    await trace.findAll('button').find((b) => b.text() === 'Trace')!.trigger('click')
    await flushPromises()
    expect(traceRoute).toHaveBeenCalledWith('http://a', 'http://c', { ttl: 12 })
    expect(trace.get('[data-testid="trace-hops"]').text()).toBe('3')
    expect(wrapper.findComponent({ name: 'TopologyCanvas' }).props('trace')?.path).toEqual(['viewer:this-browser', 'http://a', 'http://b', 'http://c'])
    wrapper.unmount()
  })

  it('sets the entry and target from the selected node with the buttons and swaps them', async () => {
    const wrapper = mount(Home)
    const [seed, refresh] = wrapper.findAll('input[type="text"]')
    await seed.setValue('http://a')
    await refresh.setValue('0')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const canvas = () => wrapper.findComponent({ name: 'TopologyCanvas' })
    canvas().vm.$emit('select', 'http://b')
    await flushPromises()
    const trace = wrapper.get('[data-testid="trace-panel"]')
    const click = async (label: string) => {
      await trace.findAll('button').find((b) => b.text() === label)!.trigger('click')
      await flushPromises()
    }
    await click('Use selected as entry')
    canvas().vm.$emit('select', 'http://c')
    await flushPromises()
    expect(trace.get('[data-testid="trace-target"]').text()).toBe('http://c')
    await click('Swap')
    expect(trace.get('input').element.value).toBe('http://c')
    expect(trace.get('[data-testid="trace-target"]').text()).toBe('http://b')
    await click('Trace')
    expect(traceRoute).toHaveBeenLastCalledWith('http://c', 'http://b', { ttl: 12 })
    expect(canvas().props('trace')?.viewer?.label).toBe('This browser')
    await click('Clear')
    expect(canvas().props('trace')).toBeUndefined()
    wrapper.unmount()
  })
})
