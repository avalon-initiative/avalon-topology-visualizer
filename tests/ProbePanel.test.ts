import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProbePanel from '../src/components/ProbePanel.vue'

const base = { busy: false, canProbe: false, canRandom: true, cooldown: 0, message: '', last: null, probes: [] }
const panel = (props: Record<string, unknown> = {}) => mount(ProbePanel, { props: { ...base, ...props } })
const button = (w: ReturnType<typeof panel>, label: string) => w.findAll('button').find((b) => b.text() === label)!

describe('ProbePanel', () => {
  it('says the first node takes the measurement', () => {
    expect(panel().text()).toMatch(/first node's own measurement, not this browser's/)
  })

  it('shows both ends, or that none is chosen', () => {
    const empty = panel()
    expect(empty.find('[data-testid="probe-from"]').text()).toBe('not chosen')
    const set = panel({ from: 'http://a:1', to: 'http://b:2' })
    expect(set.find('[data-testid="probe-from"]').text()).toBe('a:1')
    expect(set.find('[data-testid="probe-to"]').text()).toBe('b:2')
  })

  it('offers the selected node as first or second, but not as both ends', async () => {
    const w = panel({ selected: 'http://a', to: 'http://b' })
    expect(button(w, 'Use selected as first').attributes('disabled')).toBeUndefined()
    await button(w, 'Use selected as first').trigger('click')
    await button(w, 'Use selected as second').trigger('click')
    expect(w.emitted('pickFirst')).toHaveLength(1)
    expect(w.emitted('pickSecond')).toHaveLength(1)
    const same = panel({ selected: 'http://b', to: 'http://b' })
    expect(button(same, 'Use selected as first').attributes('disabled')).toBeDefined()
    expect(button(panel(), 'Use selected as first').attributes('disabled')).toBeDefined()
  })

  it('disables measuring until it is possible, and emits when clicked', async () => {
    expect(button(panel(), 'Measure distance').attributes('disabled')).toBeDefined()
    const w = panel({ canProbe: true })
    await button(w, 'Measure distance').trigger('click')
    expect(w.emitted('measure')).toHaveLength(1)
  })

  it('shows progress while busy and blocks the random action', () => {
    const w = panel({ busy: true, canRandom: false })
    expect(button(w, 'Measuring...').attributes('disabled')).toBeDefined()
    expect(button(w, 'Probe a random neighbor pair').attributes('disabled')).toBeDefined()
  })

  it('emits random when allowed', async () => {
    const w = panel()
    await button(w, 'Probe a random neighbor pair').trigger('click')
    expect(w.emitted('random')).toHaveLength(1)
  })

  it('shows the countdown only while rate limited', () => {
    expect(panel().find('[data-testid="probe-cooldown"]').exists()).toBe(false)
    expect(panel({ cooldown: 12 }).find('[data-testid="probe-cooldown"]').text()).toContain('12 s')
  })

  it('shows an error message, and no result line, for a failed probe', () => {
    const w = panel({ message: 'a does not know b', last: { ok: false, from: 'http://a', to: 'http://b', kind: 'unknown_target' } })
    expect(w.text()).toContain('a does not know b')
    expect(w.find('[data-testid="probe-result"]').exists()).toBe(false)
  })

  it('shows the value and who measured it, and lists every measured pair', () => {
    const ok = { ok: true as const, from: 'http://a', to: 'http://b', ms: 42, samplesMs: [42] }
    const w = panel({ last: ok, probes: [ok, { ...ok, to: 'http://c', ms: 7 }] })
    expect(w.find('[data-testid="probe-result"]').text()).toBe('42 ms between a and b, measured by a')
    expect(w.findAll('[data-testid="probe-row"]')).toHaveLength(2)
  })
})
