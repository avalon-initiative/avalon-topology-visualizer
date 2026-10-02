import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, visited } from './graphs'

const noop = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true })

const { walkTopology } = vi.hoisted(() => ({ walkTopology: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  fetchTrustAnchors: vi.fn(async () => []),
  walkTopology,
}))

import Home from '../src/views/Home.vue'

const seed = 'http://seed:8080'
const one = graph([visited(seed)], [])
const two = graph([visited(seed), visited('http://b')], [edge(seed, 'http://b', 'active', 20)])
const three = graph([visited(seed), visited('http://b'), visited('http://c')], [edge(seed, 'http://b', 'active', 20), edge(seed, 'http://c', 'active', 30)])

const visitedCount = (w: ReturnType<typeof mount>) => w.find('[data-testid="summary"]').text().match(/Nodes visited\s*(\d+)/)![1]

async function walk(wrapper: ReturnType<typeof mount>, result: ReturnType<typeof graph>) {
  walkTopology.mockResolvedValueOnce(result)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

async function begin() {
  const wrapper = mount(Home)
  const [seedField, refreshField] = wrapper.findAll('input[type="text"]')
  await seedField.setValue(seed)
  await refreshField.setValue('0')
  return wrapper
}

describe('Home time-lapse', () => {
  beforeEach(() => {
    walkTopology.mockReset()
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('records each refresh, replays an older one, and leaves live crawling undisturbed', async () => {
    const wrapper = await begin()
    await walk(wrapper, one)
    await walk(wrapper, two)
    const ticks = wrapper.findAll('[data-testid="timeline-note"]').map((t) => t.text())
    expect(ticks).toEqual(['first', '+1'])
    expect(wrapper.find('[data-testid="timeline-mode"]').text()).toMatch(/^Live/)
    expect(visitedCount(wrapper)).toBe('2')

    await wrapper.findAll('[data-testid="timeline-ticks"] button')[0].trigger('click')
    expect(wrapper.find('[data-testid="timeline-mode"]').text()).toMatch(/Replay: snapshot 1 of 2/)
    expect(visitedCount(wrapper)).toBe('1')
    expect(wrapper.text()).not.toContain('Live walk from')

    await walk(wrapper, three)
    expect(wrapper.findAll('[data-testid="timeline-note"]')).toHaveLength(3)
    expect(visitedCount(wrapper)).toBe('1')

    const live = wrapper.findAll('button').find((b) => b.text() === 'Back to live')!
    await live.trigger('click')
    expect(visitedCount(wrapper)).toBe('3')
    expect(wrapper.text()).toContain('Live walk from')
  })

  it('exports the history file and can import it into a fresh page', async () => {
    const wrapper = await begin()
    await walk(wrapper, one)
    await walk(wrapper, two)
    const url = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await wrapper.findAll('button').find((b) => b.text() === 'Export history')!.trigger('click')
    expect(url).toHaveBeenCalledTimes(1)
    const blob = (url.mock.calls[0] as unknown as [Blob])[0]
    const text = await blob.text()

    const fresh = mount(Home)
    const file = new File([text], 'h.json')
    const inputs = fresh.findAll('input[type="file"]')
    Object.defineProperty(inputs[1].element, 'files', { value: [file], configurable: true })
    await inputs[1].trigger('change')
    await flushPromises()
    expect(fresh.findAll('[data-testid="timeline-note"]')).toHaveLength(2)
    expect(visitedCount(fresh)).toBe('1')
  })

  it('works when browser storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    const wrapper = await begin()
    await walk(wrapper, one)
    await walk(wrapper, two)
    expect(wrapper.findAll('[data-testid="timeline-note"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="timeline-unsaved"]').exists()).toBe(true)
    expect(visitedCount(wrapper)).toBe('2')
  })
})
