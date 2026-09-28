import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ViewerRttPanel from '../src/components/ViewerRttPanel.vue'
import { rankReachable, summarize } from '../src/utils/rttStats'

const rows = [summarize('http://fast', [8.4, 8.4]), summarize('http://slow', [140, null]), summarize('http://dead', [null, null]), summarize('http://new')]

const panel = (running = false, summaries = rows) => mount(ViewerRttPanel, { props: { summaries, ranking: rankReachable(summaries), running } })

describe('ViewerRttPanel', () => {
  it('labels every value as viewer-observed and mentions browser overhead', () => {
    const text = panel().text()
    expect(text).toContain('viewer-observed')
    expect(text).toMatch(/TLS and browser overhead/)
  })

  it('lists min, smoothed and loss per node and marks fastest and slowest', () => {
    const trs = panel().findAll('[data-testid="rtt-row"]')
    expect(trs).toHaveLength(4)
    expect(trs[0].text()).toContain('http://fast')
    expect(trs[0].text()).toContain('8.4 ms')
    expect(trs[0].text()).toContain('0% loss')
    expect(trs[0].text()).toContain('fastest')
    expect(trs[1].text()).toContain('140 ms')
    expect(trs[1].text()).toContain('50% loss')
    expect(trs[1].text()).toContain('slowest')
    expect(trs[2].text()).not.toMatch(/fastest|slowest/)
  })

  it('shows a node that never answered as total loss, not as a time', () => {
    const dead = panel().findAll('[data-testid="rtt-row"]')[2].text()
    expect(dead).toContain('100% loss')
    expect(dead).not.toMatch(/\d ms/)
  })

  it('shows a node with no attempt yet without inventing loss', () => {
    const fresh = panel().findAll('[data-testid="rtt-row"]')[3].text()
    expect(fresh).toContain('0% loss')
    expect(fresh).not.toMatch(/\d ms/)
  })

  it('offers start or stop and asks the parent to toggle', async () => {
    const idle = panel(false)
    expect(idle.find('button').text()).toBe('Measure from this browser')
    await idle.find('button').trigger('click')
    expect(idle.emitted('toggle')).toHaveLength(1)
    expect(panel(true).find('button').text()).toBe('Stop measuring')
  })

  it('renders no table for no nodes', () => {
    expect(panel(false, []).find('table').exists()).toBe(false)
  })
})
