import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TracePanel from '../src/components/TracePanel.vue'
import { idlePlayback, start, buildTimeline } from '../src/utils/traceAnimation'
import type { Playback } from '../src/utils/traceAnimation'
import { summarizeTrace } from '../src/utils/traceSummary'
import { reached, stopped } from './traces'

const panel = (over: Record<string, unknown> = {}) =>
  mount(TracePanel, { props: { entry: '', entryPlaceholder: 'http://seed', target: 'http://c', loading: false, error: null, summary: null, playback: idlePlayback() as Playback, ...over } })

const buttons = (w: ReturnType<typeof panel>) => w.findAll('button').map((b) => b.text())
const button = (w: ReturnType<typeof panel>, label: string) => w.findAll('button').find((b) => b.text() === label)!
const DRIVE = ['Use selected as entry', 'Use selected as target', 'Swap']

describe('TracePanel', () => {
  it('always says the hop data is self-reported', () => {
    expect(panel().get('[data-testid="self-reported"]').text()).toMatch(/reported by the node it names/)
  })

  it('shows the entry field as From and the target as To', () => {
    const w = panel()
    expect(w.text()).toContain('From')
    expect(w.text()).toContain('To')
    expect(w.get('input').attributes('placeholder')).toBe('http://seed')
  })

  it('names the target, or says how to pick one', () => {
    expect(panel().get('[data-testid="trace-target"]').text()).toContain('http://c')
    expect(panel({ target: undefined }).get('[data-testid="trace-target"]').text()).toMatch(/click a node/)
  })

  it('offers the entry, target and swap buttons and Trace until there is a result', () => {
    expect(buttons(panel({ selected: 'http://s' }))).toEqual([...DRIVE, 'Trace'])
  })

  it('emits pick entry, pick target and swap, and disables them without something to use', async () => {
    const w = panel({ selected: 'http://s' })
    await button(w, 'Use selected as entry').trigger('click')
    await button(w, 'Use selected as target').trigger('click')
    await button(w, 'Swap').trigger('click')
    expect(w.emitted('pickEntry')).toHaveLength(1)
    expect(w.emitted('pickTarget')).toHaveLength(1)
    expect(w.emitted('swap')).toHaveLength(1)
    const none = panel({ selected: undefined, target: undefined })
    expect(button(none, 'Use selected as entry').attributes('disabled')).toBeDefined()
    expect(button(none, 'Use selected as target').attributes('disabled')).toBeDefined()
    expect(button(none, 'Swap').attributes('disabled')).toBeDefined()
    expect(button(w, 'Swap').attributes('disabled')).toBeUndefined()
  })

  it('highlights the row of the active hop only, and marks it as the current step', () => {
    const w = panel({ summary: summarizeTrace(reached()), activeHop: 1 })
    const rows = w.findAll('[data-testid="trace-row"]')
    expect(rows.map((r) => r.attributes('aria-current'))).toEqual([undefined, 'step', undefined])
    expect(rows[1].classes().length).toBeGreaterThan(0)
    expect(rows[0].classes()).toHaveLength(0)
    const none = panel({ summary: summarizeTrace(reached()), activeHop: null })
    expect(none.findAll('[aria-current]')).toHaveLength(0)
  })

  it('shows hop count, total and slowest hop for a reached target, with a row per hop', () => {
    const w = panel({ summary: summarizeTrace(reached()) })
    expect(w.get('[data-testid="trace-hops"]').text()).toBe('3')
    expect(w.get('[data-testid="trace-total"]').text()).toBe('36 ms')
    expect(w.get('[data-testid="trace-slowest"]').text()).toContain('http://a')
    expect(w.findAll('[data-testid="trace-row"]')).toHaveLength(3)
    expect(w.get('[data-testid="trace-outcome"]').text()).toContain('Target reached')
  })

  it.each([
    ['ttl', 'Hop limit reached'],
    ['no_route', 'No route'],
    ['loop', 'Loop detected'],
    ['timeout', 'Timed out'],
    ['target_unreachable', 'Target unreachable'],
  ] as const)('explains a %s stop', (reason, title) => {
    const w = panel({ summary: summarizeTrace(stopped(reason)) })
    expect(w.get('[data-testid="trace-outcome"]').text()).toContain(title)
    expect(w.get('[data-testid="trace-hops"]').text()).toBe('2')
  })

  it('offers replay, pause while playing, and slow motion that flips back to normal', async () => {
    const summary = summarizeTrace(reached())
    const playing = start(idlePlayback(), buildTimeline(reached(), 'v'))
    const w = panel({ summary, playback: playing })
    expect(buttons(w)).toEqual([...DRIVE, 'Trace', 'Replay', 'Pause', 'Slow motion', 'Clear'])
    await button(w, 'Replay').trigger('click')
    await button(w, 'Pause').trigger('click')
    await button(w, 'Slow motion').trigger('click')
    await button(w, 'Clear').trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
    expect(w.emitted('replay')).toHaveLength(1)
    expect(w.emitted('pause')).toHaveLength(1)
    expect(w.emitted('speed')?.[0]).toEqual(['slow'])
    const slow = panel({ summary, playback: { ...playing, status: 'paused', speed: 'slow' } })
    expect(buttons(slow)).toEqual([...DRIVE, 'Trace', 'Replay', 'Resume', 'Normal speed', 'Clear'])
    await button(slow, 'Normal speed').trigger('click')
    expect(slow.emitted('speed')?.[0]).toEqual(['normal'])
  })

  it('hides pause once finished and shows a request error', () => {
    const w = panel({ summary: summarizeTrace(reached()), playback: { status: 'finished', elapsedMs: 1, speed: 'normal' }, error: 'HTTP 502' })
    expect(buttons(w)).not.toContain('Pause')
    expect(w.text()).toContain('HTTP 502')
  })

  it('emits trace and the typed entry URL', async () => {
    const w = panel()
    await button(w, 'Trace').trigger('click')
    expect(w.emitted('trace')).toHaveLength(1)
    await w.get('input').setValue('http://entry')
    expect(w.emitted('update:entry')?.[0]).toEqual(['http://entry'])
  })
})
