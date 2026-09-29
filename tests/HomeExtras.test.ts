import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph } from './graphs'
import { finding, mirrorWith, reporting } from './extraGraphs'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology } = vi.hoisted(() => ({ walkTopology: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  walkTopology,
}))

import Home from '../src/views/Home.vue'

const network = () =>
  graph(
    [
      reporting('http://seed:8080', { roles: ['gateway'] }),
      reporting('http://mirror', { roles: ['hoster'], stale: true, network: 'net-b' }),
      reporting('http://other', { roles: ['hoster'] }),
    ],
    [edge('http://seed:8080', 'http://mirror', 'active', 20), edge('http://seed:8080', 'http://other', 'active', 30), mirrorWith('http://mirror', 'http://other', [finding('http://x', 'http://y', 5)])],
  )

async function open() {
  walkTopology.mockResolvedValue(network())
  const wrapper = mount(Home)
  const [seed, refresh] = wrapper.findAll('input[type="text"]')
  await seed.setValue('http://seed:8080')
  await refresh.setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('Home alerts, filters and detail', () => {
  beforeEach(() => {
    walkTopology.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists the equivocation finding and the stale node, and marks them on the drawn nodes', async () => {
    const wrapper = await open()
    const list = wrapper.find('[data-testid="alerts"]').text()
    expect(list).toContain('Alerts (2)')
    expect(list).toContain('Equivocation')
    expect(list).toContain('Stale')
    const styles = wrapper.findComponent({ name: 'TopologyCanvas' }).props('nodeStyles') as Record<string, { alerts?: string[] }>
    expect(styles['http://mirror'].alerts).toEqual(['equivocation', 'stale'])
    expect(styles['http://seed:8080'].alerts).toBeUndefined()
  })

  it('opens the node from an alert with its full report and latency history', async () => {
    const wrapper = await open()
    await wrapper.find('[data-testid="alerts"] button').trigger('click')
    const panel = wrapper.find('[aria-label="Selected node"]').text()
    expect(panel).toContain('http://mirror')
    expect(panel).toContain('Full report')
    expect(panel).toContain('Network-measured')
  })

  it('dims filtered nodes by default and hides them (with their links) on request, without moving the rest', async () => {
    const wrapper = await open()
    const canvas = () => wrapper.findComponent({ name: 'TopologyCanvas' })
    const before = { ...(canvas().props('positions') as Record<string, unknown>) }
    await wrapper.find('[data-testid="filters"] input[type="text"]').setValue('mirror')
    expect(wrapper.find('[data-testid="filters"]').text()).toContain('Showing 1 of 3 nodes')
    const styles = canvas().props('nodeStyles') as Record<string, { faded?: boolean }>
    expect(styles['http://other'].faded).toBe(true)
    expect(styles['http://mirror'].faded).toBeUndefined()
    expect(Object.keys(canvas().props('positions'))).toHaveLength(3)

    await wrapper.findAll('[data-testid="filters"] input[type="checkbox"]').at(-1)!.setValue(true)
    const after = canvas().props('positions') as Record<string, unknown>
    expect(Object.keys(after)).toEqual(['http://mirror'])
    expect(after['http://mirror']).toEqual(before['http://mirror'])
    expect((canvas().props('linkStyles') as unknown[]).length).toBe(0)
  })

  it('combines search with a facet and clears them together', async () => {
    const wrapper = await open()
    await wrapper.find('[data-testid="filters"] input[type="text"]').setValue('http://')
    const hoster = wrapper.findAll('[data-testid="filters"] label').find((l) => l.text() === 'hoster')!
    await hoster.find('input').setValue(true)
    expect(wrapper.find('[data-testid="filters"]').text()).toContain('Showing 2 of 3 nodes')
    const net = wrapper.findAll('[data-testid="filters"] label').find((l) => l.text() === 'net-b')!
    await net.find('input').setValue(true)
    expect(wrapper.find('[data-testid="filters"]').text()).toContain('Showing 1 of 3 nodes')
    await wrapper.findAll('[data-testid="filters"] button').find((b) => b.text() === 'Clear filters')!.trigger('click')
    expect(wrapper.find('[data-testid="filters"]').text()).toContain('Showing 3 of 3 nodes')
  })

  it('offers the reduced-motion toggle, on by default only when the system asks for it', async () => {
    const wrapper = await open()
    const box = wrapper.find('[data-testid="motion-toggle"] input')
    expect((box.element as HTMLInputElement).checked).toBe(false)
    await box.setValue(true)
    expect((box.element as HTMLInputElement).checked).toBe(true)
  })
})
