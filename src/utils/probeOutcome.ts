import { AvalonSdkError, CapabilityNotGrantedError, NotFoundError, RateLimitedError, RejectedError, UnavailableError } from '@avalon-initiative/protocol-sdk'
import type { ProbeResult } from '@avalon-initiative/protocol-sdk'
import { nodeLabel } from './drawGraph'
import { formatMs } from './formatRtt'

export type ProbeFailureKind =
  | 'unknown_target'
  | 'rate_limited'
  | 'timeout'
  | 'unreachable'
  | 'bad_status'
  | 'refused'
  | 'invalid'
  | 'node_unavailable'
  | 'client_timeout'
  | 'error'

export interface ProbeSuccess {
  ok: true
  /** The node that took the measurement. */
  from: string
  to: string
  /** Median of the samples, in milliseconds. */
  ms: number
  samplesMs: number[]
}

export interface ProbeFailure {
  ok: false
  from: string
  to: string
  kind: ProbeFailureKind
  retryAfterSeconds?: number
}

export type ProbeOutcome = ProbeSuccess | ProbeFailure

const fail = (from: string, to: string, kind: ProbeFailureKind, retryAfterSeconds?: number): ProbeFailure => ({
  ok: false,
  from,
  to,
  kind,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
})

/** A probe response: a timing, or the node's own reason a sample failed. */
export function interpretProbe(from: string, to: string, result: ProbeResult): ProbeOutcome {
  if (!result.ok) {
    const reason = result.error
    return fail(from, to, reason === 'timeout' || reason === 'unreachable' || reason === 'bad_status' ? reason : 'error')
  }
  const ms = result.median_ms ?? result.min_ms
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return fail(from, to, 'error')
  return { ok: true, from, to, ms, samplesMs: result.samples_ms ?? [] }
}

/** A thrown SDK error, sorted into the failures the user can act on. */
export function interpretError(from: string, to: string, err: unknown): ProbeFailure {
  if (err instanceof RateLimitedError) return fail(from, to, 'rate_limited', err.retryAfterSeconds)
  if (err instanceof NotFoundError) return fail(from, to, 'unknown_target')
  if (err instanceof CapabilityNotGrantedError) return fail(from, to, 'refused')
  if (err instanceof RejectedError) return fail(from, to, 'invalid')
  if (err instanceof UnavailableError) return fail(from, to, 'node_unavailable')
  if (err instanceof AvalonSdkError && err.status === 429) return fail(from, to, 'rate_limited', err.retryAfterSeconds)
  return fail(from, to, 'error')
}

/** Plain-language explanation of a failed probe, naming the nodes involved. */
export function describeProbeFailure(f: ProbeFailure): string {
  const [from, to] = [nodeLabel(f.from), nodeLabel(f.to)]
  switch (f.kind) {
    case 'unknown_target':
      return `${from} does not know ${to}: it is not in its peer table, so it cannot probe it. Pick one of its neighbors.`
    case 'rate_limited':
      return f.retryAfterSeconds === undefined
        ? `${from} is rate limiting probes. Try again shortly.`
        : `${from} is rate limiting probes. Try again in ${f.retryAfterSeconds} s.`
    case 'timeout':
      return `${from} got no answer from ${to} in time.`
    case 'unreachable':
      return `${from} could not connect to ${to}.`
    case 'bad_status':
      return `${to} answered ${from} with an error status.`
    case 'refused':
      return `${from} refuses to probe ${to}: the address is not allowed by its outbound policy.`
    case 'invalid':
      return `${from} rejected the probe request.`
    case 'node_unavailable':
      return `${from} could not be reached or failed while probing.`
    case 'client_timeout':
      return `${from} did not answer the probe request in time.`
    default:
      return `The probe from ${from} to ${to} failed unexpectedly.`
  }
}

/** One line for a measurement, stating which node took it. */
export function describeProbeSuccess(s: ProbeSuccess): string {
  return `${formatMs(s.ms)} between ${nodeLabel(s.from)} and ${nodeLabel(s.to)}, measured by ${nodeLabel(s.from)}`
}
