import { describe, expect, it } from 'vitest'
import { alertIssues, alertUrl, nodeIssues } from '../src/utils/issueItems'
import type { Alert } from '../src/utils/alerts'

const alerts: Alert[] = [
  { id: 'e1', kind: 'equivocation', url: 'http://a', title: 'Open equivocation on shard s1', detail: 'Sources x and y disagree at tree size 7' },
  { id: 's1', kind: 'stale', url: 'http://b', title: 'Reports itself stale', detail: 'behind' },
]

describe('alertIssues', () => {
  it('shows the kind in words as the badge, the URL first and the title and detail after it', () => {
    expect(alertIssues(alerts)).toEqual([
      { id: 'e1', badge: 'Equivocation', tone: 'danger', primary: 'http://a', secondary: 'Open equivocation on shard s1. Sources x and y disagree at tree size 7' },
      { id: 's1', badge: 'Stale', tone: 'warning', primary: 'http://b', secondary: 'Reports itself stale. behind' },
    ])
  })

  it('is empty without alerts', () => {
    expect(alertIssues([])).toEqual([])
  })
})

describe('alertUrl', () => {
  it('finds the node an alert row stands for, and nothing for an unknown id', () => {
    expect(alertUrl(alerts, 's1')).toBe('http://b')
    expect(alertUrl(alerts, 'gone')).toBeUndefined()
  })
})

describe('nodeIssues', () => {
  const items = [{ url: 'http://slow', reason: 'No response in time', detail: 'no response' }]

  it('uses the reason as the badge, the URL as id and primary, and the detail as the tooltip', () => {
    expect(nodeIssues(items, 'danger')).toEqual([{ id: 'http://slow', badge: 'No response in time', tone: 'danger', primary: 'http://slow', title: 'no response' }])
  })

  it('carries the tone it is given', () => {
    expect(nodeIssues(items, 'warning')[0].tone).toBe('warning')
  })
})
