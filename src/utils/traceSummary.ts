import type { TraceResult } from '@avalon-initiative/protocol-sdk'
import { formatMs } from './formatRtt'

export const SELF_REPORTED_NOTE =
  'Every hop is reported by the node it names, on its own clock. The path is advisory, not verified, and shows the overlay route rather than every kind of request.'

export type OutcomeKind = 'reached' | 'ttl' | 'no_route' | 'loop' | 'timeout' | 'target_unreachable' | 'incomplete'

export interface TraceOutcome {
  kind: OutcomeKind
  ok: boolean
  title: string
  message: string
}

export interface HopRow {
  index: number
  url: string
  processingMs: number
  /** Round trip to the next hop as this node reports it; null at the last hop. */
  toNextMs: number | null
  /** processingMs plus toNextMs: what this hop adds to the path. */
  costMs: number
}

/** What one hop reports about itself, short enough to sit beside its node: processing, then the forward round trip. */
export function hopLabel(row: Pick<HopRow, 'processingMs' | 'toNextMs'>): string {
  const proc = `proc ${formatMs(row.processingMs)}`
  return row.toNextMs === null ? proc : `${proc} · fwd ${formatMs(row.toNextMs)}`
}

export interface TraceSummary {
  hopCount: number
  /** As the answering node reports it, not a sum of the rows. */
  totalMs: number
  slowest: HopRow | null
  rows: HopRow[]
  outcome: TraceOutcome
}

const num = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0)

const STOPS: Record<Exclude<OutcomeKind, 'reached' | 'incomplete'>, { title: string; message: string }> = {
  ttl: { title: 'Hop limit reached', message: 'The trace ran out of forwards before it found the target, so the path ends early.' },
  no_route: { title: 'No route', message: 'The last node had no route toward the target, so the path ends there.' },
  loop: { title: 'Loop detected', message: 'The trace came back to a node it had already passed, so it stopped.' },
  timeout: { title: 'Timed out', message: 'The time budget ran out before the target answered, so the path ends early.' },
  target_unreachable: { title: 'Target unreachable', message: 'The last node reached for the target but got no answer.' },
}

export function describeOutcome(result: Pick<TraceResult, 'reached' | 'stopped_reason' | 'detail' | 'target'>): TraceOutcome {
  if (result.reached) return { kind: 'reached', ok: true, title: 'Target reached', message: `The trace reached ${result.target}.` }
  const reason = result.stopped_reason
  const base = reason && reason in STOPS ? { kind: reason as keyof typeof STOPS, ...STOPS[reason as keyof typeof STOPS] } : { kind: 'incomplete' as const, title: 'Trace incomplete', message: 'The target was not reached and no reason was reported.' }
  const detail = result.detail?.trim()
  return { ...base, ok: false, message: detail ? `${base.message} The node says: ${detail}` : base.message }
}

/** Hop count, reported total and slowest hop for one trace. The first of equally slow hops wins. */
export function summarizeTrace(result: TraceResult): TraceSummary {
  const rows: HopRow[] = result.hops.map((h, i) => {
    const toNextMs = h.to_next_ms === null || h.to_next_ms === undefined ? null : num(h.to_next_ms)
    return { index: i, url: h.base_url, processingMs: num(h.processing_ms), toNextMs, costMs: num(h.processing_ms) + (toNextMs ?? 0) }
  })
  let slowest: HopRow | null = null
  for (const r of rows) if (!slowest || r.costMs > slowest.costMs) slowest = r
  return { hopCount: rows.length, totalMs: num(result.total_ms), slowest, rows, outcome: describeOutcome(result) }
}
