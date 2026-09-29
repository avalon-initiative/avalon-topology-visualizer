import type { WalkNode } from '@avalon-initiative/protocol-sdk'
import type { DetailRow } from './nodeDetail'

/** What the node reported that the summary rows leave out, plus the whole report as it arrived. */
export function nodeReportRows(node: WalkNode): DetailRow[] {
  const self = node.self
  if (!self) return []
  const rows: DetailRow[] = []
  if (self.base_url) rows.push({ label: 'Advertised base URL', value: self.base_url, mono: true })
  for (const s of self.shards ?? []) rows.push({ label: `Shard ${s.shard_id} head signed`, value: s.sth_created_at, mono: true })
  const up = self.resources?.process_uptime_seconds
  if (typeof up === 'number') rows.push({ label: 'Process uptime', value: `${Math.round(up)} s`, mono: true })
  if (typeof self.resources?.open_file_count === 'number') rows.push({ label: 'Open files', value: String(self.resources.open_file_count), mono: true })
  rows.push({ label: 'Full report', value: JSON.stringify(self, null, 2), mono: true, block: true })
  return rows
}
