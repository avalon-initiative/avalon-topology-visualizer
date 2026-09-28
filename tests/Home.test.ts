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
})
