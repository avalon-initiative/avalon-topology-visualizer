import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TopBar from '../src/components/TopBar.vue'

const props = (extra: Record<string, unknown> = {}) => ({
  seedUrl: 'http://seed',
  refreshSeconds: '30',
  walking: false,
  hasGraph: false,
  toolsOpen: true,
  controlsOpen: true,
  status: '',
  stats: [],
  reducedMotion: false,
  ...extra,
})
const names = (w: ReturnType<typeof mount>) => w.findAll('button').map((b) => b.text())

describe('TopBar', () => {
  it('walks on submit and shows Walk network while idle', async () => {
    const w = mount(TopBar, { props: props() })
    expect(names(w)).toContain('Walk network')
    await w.get('form').trigger('submit')
    expect(w.emitted('walk')).toHaveLength(1)
  })

  it('offers Stop instead of Walk while walking', async () => {
    const w = mount(TopBar, { props: props({ walking: true }) })
    expect(names(w)).not.toContain('Walk network')
    await w.findAll('button').find((b) => b.text() === 'Stop')!.trigger('click')
    expect(w.emitted('stop')).toHaveLength(1)
  })

  it('offers Save snapshot only with a graph', () => {
    expect(names(mount(TopBar, { props: props() }))).not.toContain('Save snapshot')
    expect(names(mount(TopBar, { props: props({ hasGraph: true }) }))).toContain('Save snapshot')
  })

  it('shows the stats inline with their hints and the status line', () => {
    const w = mount(TopBar, { props: props({ status: 'Live walk from now', stats: [{ label: 'Links', value: 4, hint: 'Links between nodes' }] }) })
    expect(w.get('[data-testid="summary"]').text()).toBe('Links4')
    expect(w.get('[data-testid="summary"] div').attributes('title')).toBe('Links between nodes')
    expect(w.get('[role="status"]').text()).toBe('Live walk from now')
  })

  it('has tool and walk-form toggles that reflect their state', async () => {
    const w = mount(TopBar, { props: props({ toolsOpen: false, controlsOpen: false }) })
    const tools = w.findAll('button').find((b) => b.text() === 'Show tools')!
    expect(tools.attributes('aria-expanded')).toBe('false')
    await tools.trigger('click')
    expect(w.emitted('toggleTools')).toHaveLength(1)
    const form = w.findAll('button').find((b) => b.text() === 'Walk form')!
    expect(form.attributes('aria-expanded')).toBe('false')
    await form.trigger('click')
    expect(w.emitted('toggleControls')).toHaveLength(1)
  })

  it('keeps the walk form in the page when folded (narrow screens hide it with CSS only)', () => {
    expect(mount(TopBar, { props: props({ controlsOpen: false }) }).find('form input[type="text"]').exists()).toBe(true)
  })

  it('keeps the reduce-motion switch in the bar, showing the current state and asking to flip', async () => {
    const w = mount(TopBar, { props: props({ reducedMotion: true }) })
    const box = w.get('[data-testid="motion-toggle"] input')
    expect((box.element as HTMLInputElement).checked).toBe(true)
    expect(w.get('[data-testid="motion-toggle"]').text()).toContain('Reduce motion')
    await box.setValue(false)
    expect(w.emitted('toggleMotion')).toHaveLength(1)
  })
})
