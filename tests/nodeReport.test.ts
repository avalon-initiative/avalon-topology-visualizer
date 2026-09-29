import { describe, expect, it } from 'vitest'
import { nodeReportRows } from '../src/utils/nodeReport'
import { node } from './graphs'
import { reporting, shard } from './extraGraphs'

describe('nodeReportRows', () => {
  it('has nothing for a node that was never read', () => {
    expect(nodeReportRows(node('http://a', 'unreachable'))).toEqual([])
  })

  it('adds the head time of each shard, the resources and the raw report', () => {
    const n = reporting('http://a', { shards: [shard('s1', 4, '2026-03-03T00:00:00Z')] })
    ;(n.self as unknown as Record<string, unknown>).base_url = 'https://a.example'
    ;(n.self as unknown as Record<string, unknown>).resources = { process_uptime_seconds: 90.4, open_file_count: 12 }
    const rows = nodeReportRows(n)
    const by = Object.fromEntries(rows.map((r) => [r.label, r]))
    expect(by['Advertised base URL'].value).toBe('https://a.example')
    expect(by['Shard s1 head signed'].value).toBe('2026-03-03T00:00:00Z')
    expect(by['Process uptime'].value).toBe('90 s')
    expect(by['Open files'].value).toBe('12')
    expect(by['Full report'].block).toBe(true)
    expect(JSON.parse(by['Full report'].value).network_id).toBe('test-net')
  })

  it('still gives the raw report when the optional parts are missing', () => {
    const rows = nodeReportRows(reporting('http://a'))
    expect(rows.map((r) => r.label)).toEqual(['Full report'])
  })
})
