import type { TraceHop, TraceResult, TraceStopReason } from '@avalon-initiative/protocol-sdk'

export const hop = (base_url: string, processing_ms: number, to_next_ms?: number | null, index = 0): TraceHop => ({
  base_url,
  index,
  processing_ms,
  protocol_version: '0.1.0',
  roles: ['peer'],
  ...(to_next_ms === undefined ? {} : { to_next_ms }),
})

export const path = (...hops: [string, number, number?][]): TraceHop[] => hops.map(([url, p, next], i) => hop(url, p, next, i))

export const trace = (hops: TraceHop[], extra: Partial<TraceResult> = {}): TraceResult => ({
  hops,
  reached: true,
  target: hops[hops.length - 1]?.base_url ?? 'http://target',
  total_ms: 0,
  trace_id: '00000000-0000-4000-8000-000000000000',
  ...extra,
})

/** Three hops: entry a, relay b, target c. Legs 20 and 10 round trip; total 2 + 20 + 3 + 10 + 1 = 36. */
export const reached = (): TraceResult => trace(path(['http://a', 2, 20], ['http://b', 3, 10], ['http://c', 1]), { total_ms: 36 })

export const stopped = (reason: TraceStopReason | null, extra: Partial<TraceResult> = {}): TraceResult =>
  trace(path(['http://a', 2, 20], ['http://b', 3]), { reached: false, stopped_reason: reason, target: 'http://c', total_ms: 25, ...extra })
