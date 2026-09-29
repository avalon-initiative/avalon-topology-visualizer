import { describe, expect, it } from 'vitest'
import { toolTabs } from '../src/utils/toolTabs'

const state = { hasGraph: true, replaying: false, snapshots: 0, issues: 0 }
const byId = (s = state) => Object.fromEntries(toolTabs(s).map((t) => [t.id, t]))

describe('toolTabs', () => {
  it('lists every tool in a fixed order', () => {
    expect(toolTabs(state).map((t) => t.id)).toEqual(['timelapse', 'measure', 'trace', 'issues'])
  })

  it('leaves only the time-lapse usable without a graph', () => {
    const tabs = byId({ ...state, hasGraph: false })
    expect(tabs.timelapse.disabled).toBeUndefined()
    for (const id of ['measure', 'trace', 'issues']) expect(tabs[id].disabled).toBe(true)
  })

  it('states the time-lapse status in words, and counts the alerts', () => {
    expect(byId().timelapse.badge).toBeUndefined()
    expect(byId({ ...state, snapshots: 3 }).timelapse.badge).toBe('3')
    expect(byId({ ...state, snapshots: 3, replaying: true }).timelapse.badge).toBe('Replay')
    expect(byId({ ...state, issues: 4 }).issues.badge).toBe('4')
    expect(byId().issues.badge).toBeUndefined()
  })
})
