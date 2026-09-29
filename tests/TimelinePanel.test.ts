import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelinePanel from '../src/components/TimelinePanel.vue'
import type { TimelineMarker } from '../src/composables/useTimelapse'
import { EMPTY_DIFF } from '../src/utils/snapshotDiff'
import type { SnapshotDiff } from '../src/utils/snapshotDiff'

const marker = (index: number, joined = 0, departed = 0, versionChanges = 0): TimelineMarker => ({
  index,
  takenAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  label: [joined && `+${joined}`, departed && `-${departed}`, versionChanges && `~${versionChanges}`].filter(Boolean).join(' '),
  joined,
  departed,
  versionChanges,
})

const markers = [marker(0), marker(1, 2), marker(2, 0, 1, 1)]

const panel = (props: Partial<{ index: number | null; playing: boolean; diff: SnapshotDiff; error: string; saved: boolean; markers: TimelineMarker[] }> = {}) =>
  mount(TimelinePanel, { props: { markers, index: null, playing: false, diff: EMPTY_DIFF, error: '', saved: true, ...props } })

const button = (w: ReturnType<typeof panel>, label: string) => w.findAll('button').find((b) => b.text() === label)!

describe('TimelinePanel', () => {
  it('says it is live when not replaying, and counts what was recorded', () => {
    expect(panel().find('[data-testid="timeline-mode"]').text()).toMatch(/^Live: 3 snapshots recorded/)
    expect(button(panel(), 'Back to live').attributes('disabled')).toBeDefined()
  })

  it('says which snapshot is replayed and that live crawling continues', () => {
    const w = panel({ index: 1 })
    const text = w.find('[data-testid="timeline-mode"]').text()
    expect(text).toMatch(/Replay: snapshot 2 of 3/)
    expect(text).toMatch(/Live crawling continues/)
    expect(button(w, 'Back to live').attributes('disabled')).toBeUndefined()
  })

  it('marks joins, departures and version changes as text on the ticks', () => {
    const labels = panel().findAll('[data-testid="timeline-note"]').map((t) => t.text())
    expect(labels).toEqual(['first', '+2', '-1 ~1'])
  })

  it('numbers each snapshot so it is clear what to click', () => {
    const w = panel()
    expect(w.findAll('[data-testid="timeline-number"]').map((t) => t.text())).toEqual(['1', '2', '3'])
  })

  it('says "no change" for an unchanged snapshot after the first, and never leaves a tick blank', () => {
    const w = panel({ markers: [marker(0), marker(1), marker(2, 1)] })
    expect(w.findAll('[data-testid="timeline-note"]').map((t) => t.text())).toEqual(['first', 'no change', '+1'])
  })

  it('tags only the newest snapshot as latest', () => {
    const w = panel()
    const tagged = w.findAll('[data-testid="timeline-ticks"] li').map((li) => li.text().includes('latest'))
    expect(tagged).toEqual([false, false, true])
  })

  it('marks the replayed snapshot as the current one for assistive tech', () => {
    const w = panel({ index: 1 })
    const current = w.findAll('[data-testid="timeline-ticks"] button').map((b) => b.attributes('aria-current'))
    expect(current).toEqual([undefined, 'true', undefined])
  })

  it('seeks from a tick and from the slider, and the slider sits on the newest when live', async () => {
    const w = panel()
    const slider = w.find('input[type="range"]')
    expect((slider.element as HTMLInputElement).value).toBe('2')
    expect(slider.attributes('max')).toBe('2')
    await w.findAll('[data-testid="timeline-ticks"] button')[1].trigger('click')
    expect(w.emitted('seek')![0]).toEqual([1])
    await slider.setValue('0')
    expect(w.emitted('seek')![1]).toEqual([0])
  })

  it('emits step, play, pause, live, export and clear', async () => {
    const w = panel({ index: 1 })
    for (const label of ['Previous', 'Next', 'Play', 'Back to live', 'Export history', 'Clear history']) await button(w, label).trigger('click')
    expect(w.emitted('step')).toEqual([[-1], [1]])
    for (const name of ['play', 'live', 'export', 'clear']) expect(w.emitted(name)).toHaveLength(1)
    const playing = panel({ index: 1, playing: true })
    await button(playing, 'Pause').trigger('click')
    expect(playing.emitted('pause')).toHaveLength(1)
  })

  it('disables movement at the ends and play with fewer than two snapshots', () => {
    expect(button(panel({ index: 0 }), 'Previous').attributes('disabled')).toBeDefined()
    expect(button(panel({ index: 2 }), 'Next').attributes('disabled')).toBeDefined()
    expect(button(panel({ markers: [marker(0)] }), 'Play').attributes('disabled')).toBeDefined()
  })

  it('lists what changed at the replayed snapshot', () => {
    const w = panel({ index: 2, diff: { joined: ['http://n'], departed: ['http://d'], versionChanges: [{ url: 'http://v', from: '0.1.0', to: '0.2.0' }] } })
    const text = w.find('[data-testid="timeline-diff"]').text()
    expect(text).toContain('http://n')
    expect(text).toContain('http://d')
    expect(text).toContain('http://v 0.1.0 to 0.2.0')
    expect(panel({ index: 0 }).find('[data-testid="timeline-diff"]').exists()).toBe(false)
  })

  it('shows an empty timeline with only import available', () => {
    const w = panel({ markers: [] })
    expect(w.find('input[type="range"]').exists()).toBe(false)
    expect(w.text()).toContain('snapshots are recorded on each refresh')
    expect(button(w, 'Export history').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Import history')
  })

  it('warns when history is not saved, and shows an import error', () => {
    expect(panel().find('[data-testid="timeline-unsaved"]').exists()).toBe(false)
    const w = panel({ saved: false, error: 'Not a topology history: nope' })
    expect(w.find('[data-testid="timeline-unsaved"]').text()).toMatch(/export it/)
    expect(w.find('[role="alert"]').text()).toContain('nope')
  })

  it('passes the chosen file up', async () => {
    const w = panel()
    await w.find('input[type="file"]').trigger('change')
    expect(w.emitted('importFile')).toHaveLength(1)
  })
})
