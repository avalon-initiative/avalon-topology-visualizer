import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, node } from './graphs'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology } = vi.hoisted(() => ({ walkTopology: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  walkTopology,
}))

import Home from '../src/views/Home.vue'

async function walkFrom(seed: string) {
  const wrapper = mount(Home)
  const [seedField, refreshField] = wrapper.findAll('input[type="text"]')
  await seedField.setValue(seed)
  await refreshField.setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('Home', () => {
  beforeEach(() => {
    walkTopology.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
  })

  afterEach(() => vi.restoreAllMocks())

  it('rejects a seed that is not an http(s) URL without walking', async () => {
    const wrapper = await walkFrom('not a url')
    expect(walkTopology).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter an http(s) URL')
  })

  it('walks from the normalized seed and shows the merged summary', async () => {
    walkTopology.mockResolvedValue(graph([node('http://seed:8080'), node('http://b')], [edge('http://seed:8080', 'http://b')]))
    const wrapper = await walkFrom('HTTP://seed:8080/')
    expect(walkTopology.mock.calls[0][0]).toEqual(['http://seed:8080'])
    const summary = wrapper.find('[data-testid="summary"]').text()
    expect(summary).toMatch(/Nodes visited\s*2/)
    expect(summary).toMatch(/Links\s*1/)
  })

  it('draws the graph with a scale bar once a walk has produced one', async () => {
    walkTopology.mockResolvedValue(graph([node('http://seed:8080'), node('http://b')], [edge('http://seed:8080', 'http://b', 'active', 25)]))
    const wrapper = await walkFrom('http://seed:8080')
    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(wrapper.find('[data-testid="scale-bar"]').text()).toMatch(/\d+ ms round trip/)
  })

  it('shows the legend with the graph, and details only once a node is selected', async () => {
    walkTopology.mockResolvedValue(graph([node('http://seed:8080'), node('http://b')], [edge('http://seed:8080', 'http://b', 'active', 25)]))
    const wrapper = await walkFrom('http://seed:8080')
    expect(wrapper.find('[aria-label="Legend"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Selected node"]').exists()).toBe(false)
    wrapper.findComponent({ name: 'TopologyCanvas' }).vm.$emit('select', 'http://b')
    await flushPromises()
    expect(wrapper.find('[aria-label="Selected node"]').text()).toContain('http://b')
    wrapper.findComponent({ name: 'TopologyCanvas' }).vm.$emit('select', undefined)
    await flushPromises()
    expect(wrapper.find('[aria-label="Selected node"]').exists()).toBe(false)
  })

  it('shows no graph before there is a walk', () => {
    const wrapper = mount(Home)
    expect(wrapper.find('canvas').exists()).toBe(false)
  })

  it('lists unreachable and rate-limited nodes with their reasons', async () => {
    walkTopology.mockResolvedValue(
      graph(
        [
          node('http://seed'),
          node('http://slow', 'unreachable', { failure: { reason: 'timeout', message: 'no response' } }),
          node('http://busy', 'unreachable', { failure: { reason: 'rate_limited', status: 429, retryAfterSeconds: 30, message: 'slow down' } }),
        ],
        [],
      ),
    )
    const text = (await walkFrom('http://seed')).text()
    expect(text).toContain('http://slow')
    expect(text).toContain('No response in time')
    expect(text).toContain('http://busy')
    expect(text).toContain('Rate limited, retry after 30s')
  })

  it('says when the walk stopped at a limit', async () => {
    walkTopology.mockResolvedValue(graph([node('http://seed')], [], { truncated: { maxNodes: true, maxDepth: false } }))
    expect((await walkFrom('http://seed')).text()).toContain('Stopped at the node limit')
  })

  it('shows the failure when the walk throws', async () => {
    walkTopology.mockRejectedValue(new Error('boom'))
    expect((await walkFrom('http://seed')).text()).toContain('boom')
  })

  describe('viewer measurements', () => {
    const labels: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, key) => (key === 'fillText' ? (text: string) => labels.push(text) : () => undefined),
      set: () => true,
    })

    beforeEach(() => {
      labels.length = 0
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
    })

    afterEach(() => vi.unstubAllGlobals())

    const measured = () => {
      walkTopology.mockResolvedValue(
        graph(
          [node('http://seed:8080'), node('http://b'), node('http://dead', 'unreachable', { failure: { reason: 'timeout', message: 'no response' } })],
          [edge('http://seed:8080', 'http://b', 'active', 25)],
        ),
      )
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('dead')) throw new TypeError('Failed to fetch')
        return new Response(null, { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('does not request anything from the nodes until measuring is switched on', async () => {
      const fetchMock = measured()
      const wrapper = await walkFrom('http://seed:8080')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="viewer-rtt"]').text()).toContain('viewer-observed')
      expect(labels).not.toContain('You (viewer-observed)')
    })

    it('measures every node, shows loss for the unreachable one, and adds the viewer to the drawn graph', async () => {
      const fetchMock = measured()
      const wrapper = await walkFrom('http://seed:8080')
      await wrapper.find('[data-testid="viewer-rtt"] button').trigger('click')
      await flushPromises()
      expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
        'http://b/nodes/status',
        'http://dead/nodes/status',
        'http://seed:8080/nodes/status',
      ])
      const rows = wrapper.findAll('[data-testid="rtt-row"]').map((r) => r.text())
      expect(rows.find((r) => r.includes('http://dead'))).toContain('100% loss')
      expect(rows.find((r) => r.includes('http://b'))).toContain('0% loss')
      expect(wrapper.find('[data-testid="viewer-rtt"] button').text()).toBe('Stop measuring')
      expect(labels).toContain('You (viewer-observed)')
      wrapper.unmount()
    })

    it('draws a link from the viewer to each node that answered, and none to one that did not', async () => {
      measured()
      const wrapper = await walkFrom('http://seed:8080')
      await wrapper.find('[data-testid="viewer-rtt"] button').trigger('click')
      await flushPromises()
      const styled = wrapper.findComponent({ name: 'TopologyCanvas' }).props('linkStyles') as { a: string; b: string }[]
      const toViewer = styled.filter((l) => l.a === 'viewer:this-browser' || l.b === 'viewer:this-browser').map((l) => (l.a === 'viewer:this-browser' ? l.b : l.a))
      expect(toViewer.sort()).toEqual(['http://b', 'http://seed:8080'])
      wrapper.unmount()
    })

    it('stops when asked and leaves the graph and summary counts alone', async () => {
      const fetchMock = measured()
      const wrapper = await walkFrom('http://seed:8080')
      const button = () => wrapper.find('[data-testid="viewer-rtt"] button')
      await button().trigger('click')
      await flushPromises()
      await button().trigger('click')
      expect(button().text()).toBe('Measure from this browser')
      const calls = fetchMock.mock.calls.length
      await new Promise((r) => setTimeout(r, 30))
      expect(fetchMock.mock.calls.length).toBe(calls)
      expect(wrapper.find('[data-testid="summary"]').text()).toMatch(/Nodes visited\s*2/)
      expect(wrapper.find('[data-testid="summary"]').text()).toMatch(/Links\s*1/)
    })
  })
})
