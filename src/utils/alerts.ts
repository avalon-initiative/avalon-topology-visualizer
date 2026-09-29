import type { NodeFacts } from './nodeFacts'

export type AlertKind = 'equivocation' | 'stale'

export interface Alert {
  /** Stable across refreshes for the same finding, so a list can key on it. */
  id: string
  kind: AlertKind
  /** The node the alert is drawn on: the one that reported the finding, or the one that says it is stale. */
  url: string
  title: string
  detail: string
}

export const ALERT_LABELS: Record<AlertKind, string> = { equivocation: 'Equivocation', stale: 'Stale' }

/** One alert per open equivocation finding (a mirror can list several) and one per node that reports itself stale. */
export function deriveAlerts(facts: Record<string, NodeFacts>): Alert[] {
  const alerts: Alert[] = []
  for (const f of Object.values(facts)) {
    const seen = new Set<string>()
    for (const m of f.mirrors) {
      for (const o of m.open_equivocations) {
        const id = `equivocation|${f.url}|${m.shard_id}|${o.tree_size}|${o.source_a}|${o.source_b}`
        if (seen.has(id)) continue
        seen.add(id)
        alerts.push({
          id,
          kind: 'equivocation',
          url: f.url,
          title: `Open equivocation on shard ${m.shard_id}`,
          detail: `Sources ${o.source_a} and ${o.source_b} disagree at tree size ${o.tree_size}`,
        })
      }
    }
    if (f.status === 'visited' && f.stale) {
      alerts.push({ id: `stale|${f.url}`, kind: 'stale', url: f.url, title: 'Reports itself stale', detail: 'The node says it is behind its peers' })
    }
  }
  return alerts.sort((a, b) => (a.kind === b.kind ? a.url.localeCompare(b.url) : a.kind === 'equivocation' ? -1 : 1))
}

/** Which kinds of alert each node carries, for marking it on the graph. Absent means none. */
export function alertKindsByNode(alerts: readonly Alert[]): Record<string, AlertKind[]> {
  const out: Record<string, AlertKind[]> = {}
  for (const a of alerts) if (!out[a.url]?.includes(a.kind)) out[a.url] = [...(out[a.url] ?? []), a.kind]
  return out
}
