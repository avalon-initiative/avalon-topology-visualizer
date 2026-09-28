import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { walkTopology } = vi.hoisted(() => ({ walkTopology: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  walkTopology,
}))

import Home from '../src/views/Home.vue'

describe('Home', () => {
  beforeEach(() => {
    walkTopology.mockReset()
  })

  it('rejects a seed that is not an http(s) URL without walking', async () => {
    const wrapper = mount(Home)
    await wrapper.find('input').setValue('not a url')
    await wrapper.find('form').trigger('submit')
    expect(walkTopology).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter an http(s) URL')
  })

  it('walks from the normalized seed and shows the summary', async () => {
    walkTopology.mockResolvedValue({
      seeds: ['http://seed:8080'],
      nodes: [{ url: 'http://seed:8080', depth: 0, status: 'visited', reportedBy: [] }],
      edges: [],
      truncated: { maxNodes: false, maxDepth: false },
      cancelled: false,
    })
    const wrapper = mount(Home)
    await wrapper.find('input').setValue('HTTP://seed:8080/')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(walkTopology).toHaveBeenCalledWith(['http://seed:8080'])
    expect(wrapper.find('[data-testid="summary"]').text()).toContain('Nodes visited')
  })

  it('shows the failure when the walk throws', async () => {
    walkTopology.mockImplementation(async () => {
      throw new Error('boom')
    })
    const wrapper = mount(Home)
    await wrapper.find('input').setValue('http://seed:8080')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('boom')
  })
})
