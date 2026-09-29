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
