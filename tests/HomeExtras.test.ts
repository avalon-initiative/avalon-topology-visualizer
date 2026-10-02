import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph } from './graphs'
import { finding, mirrorWith, reporting } from './extraGraphs'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology } = vi.hoisted(() => ({ walkTopology: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  fetchTrustAnchors: vi.fn(async () => []),
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

  const bar = (w: Awaited<ReturnType<typeof open>>) => w.get('[data-testid="filters"]')
  const facet = (w: Awaited<ReturnType<typeof open>>, name: string) => bar(w).findAll('[role="group"]').find((g) => g.attributes('aria-label') === name)!
  const tick = async (w: Awaited<ReturnType<typeof open>>, name: string, value: string) => {
    const label = facet(w, name).findAll('label').find((l) => l.text() === value)!
    await label.get('input').setValue(true)
  }
  const chips = (w: Awaited<ReturnType<typeof open>>) => bar(w).findAll('[data-testid="filter-chips"] li').map((c) => c.text())

  it('dims filtered nodes by default and hides them (with their links) on request, without moving the rest', async () => {
    const wrapper = await open()
    const canvas = () => wrapper.findComponent({ name: 'TopologyCanvas' })
    const before = { ...(canvas().props('positions') as Record<string, unknown>) }
    await bar(wrapper).get('input[type="text"]').setValue('mirror')
    expect(bar(wrapper).text()).toContain('Showing 1 of 3 nodes')
    expect(chips(wrapper)).toEqual(['URL: mirror'])
    const styles = canvas().props('nodeStyles') as Record<string, { faded?: boolean }>
    expect(styles['http://other'].faded).toBe(true)
    expect(styles['http://mirror'].faded).toBeUndefined()
    expect(Object.keys(canvas().props('positions'))).toHaveLength(3)

    const hide = bar(wrapper).get('input[role="switch"]')
    expect(bar(wrapper).text()).toContain('stay on the map, dimmed')
    await hide.setValue(true)
    expect(bar(wrapper).text()).toContain('removed from the map')
    const after = canvas().props('positions') as Record<string, unknown>
    expect(Object.keys(after)).toEqual(['http://mirror'])
    expect(after['http://mirror']).toEqual(before['http://mirror'])
    expect((canvas().props('linkStyles') as unknown[]).length).toBe(0)
  })

  it('opens a facet, ticks values, shows a chip for each and narrows the map', async () => {
    const wrapper = await open()
    const trigger = () => bar(wrapper).findAll('button[aria-haspopup]').map((b) => b.text())
    expect(trigger()).toEqual(['Role', 'Network', 'Version'])
    await tick(wrapper, 'Role', 'hoster')
    expect(bar(wrapper).text()).toContain('Showing 2 of 3 nodes')
    expect(chips(wrapper)).toEqual(['Role: hoster'])
    expect(trigger()[0]).toBe('Role · 1')
    await tick(wrapper, 'Network', 'net-b')
    expect(bar(wrapper).text()).toContain('Showing 1 of 3 nodes')
    expect(chips(wrapper)).toEqual(['Role: hoster', 'Network: net-b'])
  })

  it('removes only the value a chip stands for, and the search with its chip', async () => {
    const wrapper = await open()
    await bar(wrapper).get('input[type="text"]').setValue('http://')
    await tick(wrapper, 'Role', 'hoster')
    await tick(wrapper, 'Role', 'gateway')
    expect(chips(wrapper)).toEqual(['Role: hoster', 'Role: gateway', 'URL: http://'])
    await bar(wrapper).get('button[aria-label="Remove Role: gateway"]').trigger('click')
    expect(chips(wrapper)).toEqual(['Role: hoster', 'URL: http://'])
    expect(bar(wrapper).text()).toContain('Showing 2 of 3 nodes')
    await bar(wrapper).get('button[aria-label="Remove URL: http://"]').trigger('click')
    expect((bar(wrapper).get('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect(chips(wrapper)).toEqual(['Role: hoster'])
  })

  it('clears every filter together and offers Clear only while one is on', async () => {
    const wrapper = await open()
    const clear = () => bar(wrapper).findAll('button').find((b) => b.text() === 'Clear filters')
    expect(clear()).toBeUndefined()
    await bar(wrapper).get('input[type="text"]').setValue('http://')
    await tick(wrapper, 'Role', 'hoster')
    await tick(wrapper, 'Network', 'net-b')
    expect(bar(wrapper).text()).toContain('Showing 1 of 3 nodes')
    await clear()!.trigger('click')
    expect(bar(wrapper).text()).toContain('Showing 3 of 3 nodes')
    expect(chips(wrapper)).toEqual([])
    expect(clear()).toBeUndefined()
  })

  it('keeps the filter bar out of the drawer and the drawer beside the map', async () => {
    const wrapper = await open()
    const stage = wrapper.findComponent({ name: 'TopologyCanvas' }).element.parentElement!
    expect(bar(wrapper).element.parentElement).toBe(stage.parentElement)
    expect(bar(wrapper).element.nextElementSibling).toBe(stage)
  })

  it('offers the reduced-motion toggle, on by default only when the system asks for it', async () => {
    const wrapper = await open()
    const box = wrapper.find('[data-testid="motion-toggle"] input')
    expect((box.element as HTMLInputElement).checked).toBe(false)
    await box.setValue(true)
    expect((box.element as HTMLInputElement).checked).toBe(true)
  })
})
