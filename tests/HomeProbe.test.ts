import { NotFoundError } from '@avalon-initiative/protocol-sdk'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edge, graph, visited } from './graphs'

const { walkTopology, probeNode } = vi.hoisted(() => ({ walkTopology: vi.fn(), probeNode: vi.fn() }))
vi.mock('@avalon-initiative/protocol-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@avalon-initiative/protocol-sdk')>()),
  walkTopology,
  probeNode,
}))

import Home from '../src/views/Home.vue'

const drawn: string[] = []
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key: string) => (key === 'fillText' ? (text: string) => drawn.push(text) : () => undefined),
  set: () => true,
})

const A = 'http://a:8080'
const B = 'http://b:8080'

async function load() {
  walkTopology.mockResolvedValue(graph([visited(A), visited(B)], [edge(A, B, 'active', 25), edge(B, A, 'active', 25)]))
  const wrapper = mount(Home)
  const [seed, refresh] = wrapper.findAll('input[type="text"]')
  await seed.setValue(A)
  await refresh.setValue('0')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

const click = async (w: Awaited<ReturnType<typeof load>>, label: string) => {
  await w.findAll('button').find((b) => b.text() === label)!.trigger('click')
  await flushPromises()
}
const select = async (w: Awaited<ReturnType<typeof load>>, id: string) => {
  w.findComponent({ name: 'TopologyCanvas' }).vm.$emit('select', id)
  await flushPromises()
}

describe('Home probe flow', () => {
  beforeEach(() => {
    drawn.length = 0
    walkTopology.mockReset()
    probeNode.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('selecting two nodes measures, labels the link with the measuring node, and reports it', async () => {
    probeNode.mockResolvedValue({ ok: true, samples_ms: [40, 41, 39], target: B, median_ms: 40, min_ms: 39 })
    const w = await load()
    await select(w, A)
    await click(w, 'Use selected as first')
    await select(w, B)
    await click(w, 'Use selected as second')
    await click(w, 'Measure distance')
    expect(probeNode).toHaveBeenCalledWith(A, B, 3)
    expect(w.find('[data-testid="probe-result"]').text()).toBe('40 ms between a:8080 and b:8080, measured by a:8080')
    expect(drawn).toContain('40 ms by a:8080')
  })

  it('pulls the pair to the measured distance in the layout', async () => {
    probeNode.mockResolvedValue({ ok: true, samples_ms: [100], target: B, median_ms: 100, min_ms: 100 })
    const w = await load()
    const dist = () => {
      const p = w.findComponent({ name: 'TopologyCanvas' }).props('positions') as Record<string, { x: number; y: number }>
      const pxPerMs = (w.vm as unknown as { layout: { pxPerMs: number } }).layout.pxPerMs
      return Math.hypot(p[A].x - p[B].x, p[A].y - p[B].y) / pxPerMs
    }
    const before = dist()
    await click(w, 'Probe a random neighbor pair')
    expect(before).toBeCloseTo(25, -1)
    expect(dist()).toBeGreaterThan(before + 20)
  })

  it('explains an unknown target instead of drawing a link', async () => {
    probeNode.mockRejectedValue(new NotFoundError('unknown_target'))
    const w = await load()
    await click(w, 'Probe a random neighbor pair')
    expect(w.text()).toMatch(/not in its peer table/)
    expect(w.find('[data-testid="probe-row"]').exists()).toBe(false)
    expect(drawn.some((t) => t.includes(' by '))).toBe(false)
  })
})
