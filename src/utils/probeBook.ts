import { nodeLabel } from './drawGraph'
import { formatMs } from './formatRtt'
import type { LayoutLink } from './layout'
import type { ProbeSuccess } from './probeOutcome'

export type ProbeBook = Record<string, ProbeSuccess>

const keyOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

/** The latest measurement per pair of nodes, whichever end took it. */
export function recordProbe(book: ProbeBook, result: ProbeSuccess): ProbeBook {
  return { ...book, [keyOf(result.from, result.to)]: result }
}

/** Measurements whose two ends are both still in the graph. */
export function liveProbes(book: ProbeBook, urls: readonly string[]): ProbeSuccess[] {
  const known = new Set(urls)
  return Object.values(book).filter((p) => known.has(p.from) && known.has(p.to))
}

export function probeLayoutLinks(probes: readonly ProbeSuccess[]): LayoutLink[] {
  return probes.map((p) => ({ a: p.from, b: p.to, rttMs: p.ms }))
}

/** Links to draw, labelled with the value and the node that measured it. */
export function probeDrawLinks(probes: readonly ProbeSuccess[]): { a: string; b: string; label: string }[] {
  return probes.map((p) => ({ a: p.from, b: p.to, label: `${formatMs(p.ms)} by ${nodeLabel(p.from)}` }))
}
