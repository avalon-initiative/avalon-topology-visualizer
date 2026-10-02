import { normalizeNodeUrl, traceRoute } from '@avalon-initiative/protocol-sdk'
import type { TraceResult } from '@avalon-initiative/protocol-sdk'

export const DEFAULT_TTL = 12

export interface TraceRequest {
  entry: string
  target: string
  ttl?: number
  traceFn?: typeof traceRoute
}

export class TraceInputError extends Error {}

/** Hop URLs in the same normalized form the walk uses, so they match graph nodes. Anything unparseable stays as returned. */
export function normalizeTrace(result: TraceResult): TraceResult {
  return { ...result, hops: result.hops.map((h) => ({ ...h, base_url: normalizeNodeUrl(h.base_url) ?? h.base_url })) }
}

/** Sends one trace request to the entry node through the SDK (a public POST, no credentials). */
export async function runTrace(req: TraceRequest): Promise<TraceResult> {
  const entry = normalizeNodeUrl(req.entry)
  const target = normalizeNodeUrl(req.target)
  if (!entry) throw new TraceInputError('Enter an http(s) URL for the entry node.')
  if (!target) throw new TraceInputError('Pick a target node first.')
  const ttl = Math.min(16, Math.max(1, Math.trunc(req.ttl ?? DEFAULT_TTL)))
  return normalizeTrace(await (req.traceFn ?? traceRoute)(entry, target, { ttl }))
}

/** Joins consecutive legs into one path: where a leg ends and the next begins is the same node, so it is one hop carrying both legs' time there. */
export function joinLegs(legs: TraceResult[]): TraceResult {
  const hops: TraceResult['hops'] = []
  for (const leg of legs) {
    leg.hops.forEach((h, i) => {
      const last = hops[hops.length - 1]
      if (i === 0 && last && last.base_url === h.base_url) hops[hops.length - 1] = { ...last, processing_ms: (last.processing_ms ?? 0) + (h.processing_ms ?? 0), to_next_ms: h.to_next_ms }
      else hops.push({ ...h })
    })
  }
  const final = legs[legs.length - 1]
  return {
    ...final,
    hops: hops.map((h, index) => ({ ...h, index })),
    reached: legs.every((l) => l.reached),
    total_ms: legs.reduce((sum, l) => sum + (l.total_ms ?? 0), 0),
    trace_id: legs[0].trace_id,
  }
}

export interface ItineraryRequest {
  /** Entry, then each stop in order, ending at the last stop to reach; at least two. */
  stops: string[]
  ttl?: number
  traceFn?: typeof traceRoute
}

/**
 * A route through chosen nodes: one trace per leg, each asked of the node that leg starts from (a trace is a public
 * POST to any node), then joined. It stops at the first leg that does not arrive. The legs are separate traces, so
 * the network still picks the route inside each one.
 */
export async function runItinerary(req: ItineraryRequest): Promise<TraceResult> {
  const stops = req.stops.map((s) => normalizeNodeUrl(s))
  if (stops.length < 2 || stops.some((s) => !s)) throw new TraceInputError('Every stop needs an http(s) URL, and a route needs at least a start and an end.')
  const urls = stops as string[]
  if (urls.some((u, i) => i > 0 && u === urls[i - 1])) throw new TraceInputError('Two stops in a row are the same node.')
  const legs: TraceResult[] = []
  for (let i = 0; i < urls.length - 1; i++) {
    const leg = await runTrace({ entry: urls[i], target: urls[i + 1], ttl: req.ttl, traceFn: req.traceFn })
    legs.push(leg)
    if (!leg.reached) break
  }
  return joinLegs(legs)
}
