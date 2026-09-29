import { probeNode } from '@avalon-initiative/protocol-sdk'
import type { ProbeResult } from '@avalon-initiative/protocol-sdk'
import { interpretError, interpretProbe } from '../utils/probeOutcome'
import type { ProbeOutcome } from '../utils/probeOutcome'

/** Sequential samples per probe; the first includes connection setup, so the median skips it. */
export const PROBE_SAMPLES = 3
/** The SDK call cannot be aborted, so a stuck node is given up on after this long. */
export const PROBE_TIMEOUT_MS = 15_000

export interface PairProbeOptions {
  probe?: (nodeUrl: string, target: string, samples?: number) => Promise<ProbeResult>
  timeoutMs?: number
  samples?: number
}

/** Asks `from` to measure its round trip to `to` (the SDK's probe call, the only write this app makes). Never throws. */
export async function probePair(from: string, to: string, options: PairProbeOptions = {}): Promise<ProbeOutcome> {
  const probe = options.probe ?? probeNode
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), options.timeoutMs ?? PROBE_TIMEOUT_MS)
  })
  try {
    const won = await Promise.race([probe(from, to, options.samples ?? PROBE_SAMPLES), timedOut])
    if (won === 'timeout') return { ok: false, from, to, kind: 'client_timeout' }
    return interpretProbe(from, to, won)
  } catch (err) {
    return interpretError(from, to, err)
  } finally {
    clearTimeout(timer)
  }
}
