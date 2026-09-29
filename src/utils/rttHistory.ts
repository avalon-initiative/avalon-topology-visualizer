import type { DetailRow } from './nodeDetail'
import { formatLoss, formatMs } from './formatRtt'
import type { MergedGraph } from './mergeGraph'
import { summarize } from './rttStats'

export interface RttPoint {
  /** Milliseconds since the epoch of the refresh that produced it. */
  at: number
  ms: number
}

/** Crawl-measured round trips per node URL, oldest first, bounded. */
export type CrawlHistory = Record<string, RttPoint[]>

export const HISTORY_LIMIT = 30

/** Per node: the mean of the round trips the network measured on every link touching it. Nodes with none are absent. */
export function crawlRtts(merged: MergedGraph): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>()
  for (const link of merged.links) {
    for (const ms of Object.values(link.rttBy)) {
      for (const url of [link.a, link.b]) {
        const s = sums.get(url) ?? { total: 0, n: 0 }
        sums.set(url, { total: s.total + ms, n: s.n + 1 })
      }
    }
  }
  return Object.fromEntries([...sums].map(([url, s]) => [url, s.total / s.n]))
}

/** Adds one point per measured node for this refresh and forgets nodes that left the graph. */
export function recordCrawl(history: CrawlHistory, merged: MergedGraph, at: number, limit = HISTORY_LIMIT): CrawlHistory {
  const now = crawlRtts(merged)
  const out: CrawlHistory = {}
  for (const n of merged.nodes) {
    const points = history[n.url] ?? []
    const ms = now[n.url]
    const next = ms === undefined ? points : [...points, { at, ms }]
    if (next.length > 0) out[n.url] = next.slice(-Math.max(1, limit))
  }
  return out
}

/** Detail rows for the measured latency of one node: the crawl's own refreshes and this browser's samples. */
export function historyRows(crawl: readonly RttPoint[] = [], viewer: readonly (number | null)[] = []): DetailRow[] {
  const rows: DetailRow[] = []
  if (crawl.length > 0) {
    const values = crawl.map((p) => p.ms)
    rows.push({ label: `Network-measured (${crawl.length} refresh${crawl.length === 1 ? '' : 'es'})`, value: `min ${formatMs(Math.min(...values))}, last ${formatMs(values[values.length - 1])}`, mono: true })
    rows.push({ label: 'Network-measured history', value: values.map((v) => formatMs(v)).join(', '), mono: true })
  } else {
    rows.push({ label: 'Network-measured', value: 'no measurement yet', mono: true })
  }
  if (viewer.length > 0) {
    const s = summarize('', viewer)
    rows.push({ label: `Viewer-observed (${viewer.length} sample${viewer.length === 1 ? '' : 's'})`, value: `min ${formatMs(s.minMs)}, smoothed ${formatMs(s.smoothedMs)}, ${formatLoss(s.lossRatio)}`, mono: true })
    rows.push({ label: 'Viewer-observed history', value: viewer.map((v) => (v === null ? 'lost' : formatMs(v))).join(', '), mono: true })
  }
  return rows
}
