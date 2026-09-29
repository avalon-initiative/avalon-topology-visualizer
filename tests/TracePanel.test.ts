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

describe('TracePanel', () => {
  it('always says the hop data is self-reported', () => {
    expect(panel().get('[data-testid="self-reported"]').text()).toMatch(/reported by the node it names/)
  })

  it('names the target, or says how to pick one', () => {
    expect(panel().get('[data-testid="trace-target"]').text()).toContain('http://c')
    expect(panel({ target: undefined }).get('[data-testid="trace-target"]').text()).toMatch(/click a node/)
  })

  it('offers only Trace until there is a result', () => {
    expect(buttons(panel())).toEqual(['Trace to selected node'])
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
    expect(buttons(w)).toEqual(['Trace to selected node', 'Replay', 'Pause', 'Slow motion'])
    await w.findAll('button')[1].trigger('click')
    await w.findAll('button')[2].trigger('click')
    await w.findAll('button')[3].trigger('click')
    expect(w.emitted('replay')).toHaveLength(1)
    expect(w.emitted('pause')).toHaveLength(1)
    expect(w.emitted('speed')?.[0]).toEqual(['slow'])
    const slow = panel({ summary, playback: { ...playing, status: 'paused', speed: 'slow' } })
    expect(buttons(slow)).toEqual(['Trace to selected node', 'Replay', 'Resume', 'Normal speed'])
    await slow.findAll('button')[3].trigger('click')
    expect(slow.emitted('speed')?.[0]).toEqual(['normal'])
  })

  it('hides pause once finished and shows a request error', () => {
    const w = panel({ summary: summarizeTrace(reached()), playback: { status: 'finished', elapsedMs: 1, speed: 'normal' }, error: 'HTTP 502' })
    expect(buttons(w)).not.toContain('Pause')
    expect(w.text()).toContain('HTTP 502')
  })

  it('emits trace and the typed entry URL', async () => {
    const w = panel()
    await w.findAll('button')[0].trigger('click')
    expect(w.emitted('trace')).toHaveLength(1)
    await w.get('input').setValue('http://entry')
    expect(w.emitted('update:entry')?.[0]).toEqual(['http://entry'])
  })
})
