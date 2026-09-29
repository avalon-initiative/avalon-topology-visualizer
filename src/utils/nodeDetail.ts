import type { AvalonDetailListItem } from '@avalon-initiative/common-ui'
import type { MergedGraph } from './mergeGraph'
import { lagOf } from './nodeFacts'
import type { NodeFacts } from './nodeFacts'
import { roundTripMs } from './mergeGraph'

/** Label/value row for the shared detail list; `block` shows a long multi-line value under its label. */
export type DetailRow = AvalonDetailListItem

const other = (link: { a: string; b: string }, url: string) => (link.a === url ? link.b : link.a)

/** Everything the node reported about itself, and every link it appears on, as label/value rows. */
export function nodeDetailRows(facts: NodeFacts, merged: MergedGraph): DetailRow[] {
  const rows: DetailRow[] = [{ label: 'URL', value: facts.url, mono: true }]
  rows.push({ label: 'Status', value: facts.failure ? `${facts.status}: ${facts.failure.message}` : facts.status })
  rows.push({ label: 'Hops from the seed', value: String(facts.depth), mono: true })
  if (facts.reportedBy.length > 0) rows.push({ label: 'Reported by', value: facts.reportedBy.join(', '), mono: true })
  if (facts.roles.length > 0) rows.push({ label: 'Roles', value: facts.roles.join(', ') })
  if (facts.version) {
    const state = facts.versionState === 'behind' ? ` (behind newest ${facts.newestVersion})` : facts.versionState === 'newest' ? ' (newest seen)' : ''
    rows.push({ label: 'Protocol version', value: `${facts.version}${state}`, mono: true })
  }
  if (facts.status === 'visited') rows.push({ label: 'Reports itself stale', value: facts.stale ? 'yes' : 'no' })
  if (facts.networkId) rows.push({ label: 'Network', value: facts.networkId, mono: true })
  if (facts.libp2pPeerId) rows.push({ label: 'Peer id', value: facts.libp2pPeerId, mono: true })
  if (facts.coordinate) {
    const c = facts.coordinate
    rows.push({ label: 'Network coordinate', value: `[${c.vector.map((v) => v.toFixed(1)).join(', ')}] height ${c.height.toFixed(1)} error ${c.error.toFixed(2)}`, mono: true })
  }
  for (const s of facts.shards) rows.push({ label: `Shard ${s.id}`, value: `tree size ${s.treeSize}`, mono: true })
  for (const m of facts.mirrors) {
    const lag = lagOf(m)
    rows.push({
      label: `Mirrors ${m.source_url}`,
      value: `shard ${m.shard_id}: ${m.mirrored_entries} of ${m.observed_tree_size ?? 'unknown'} entries${lag ? `, ${lag.entries} behind` : ''}${m.open_equivocations.length > 0 ? `, ${m.open_equivocations.length} open equivocation finding(s)` : ''}`,
      mono: true,
    })
  }
  for (const link of merged.links.filter((l) => l.a === facts.url || l.b === facts.url)) {
    const rtts = link.observations.map((o) => [o.from, roundTripMs(o)] as const).filter((x): x is readonly [string, number] => x[1] !== undefined)
    const kinds = [...new Set(link.observations.map((o) => o.kind))].join(' + ')
    const rtt = rtts.length > 0 ? `, ${rtts.map(([from, ms]) => `${ms.toFixed(1)} ms seen by ${from}`).join('; ')}` : ''
    rows.push({ id: `link:${link.a}|${link.b}`, label: `Link to ${other(link, facts.url)}`, value: `${kinds}${link.disagreement ? ' (the two ends disagree)' : ''}${rtt}`, mono: true })
  }
  return rows
}
