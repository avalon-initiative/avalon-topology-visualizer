import type { MergedLink } from './mergeGraph'
import type { NodeFacts, VersionState } from './nodeFacts'
import { shapeForRoles } from './shapes'
import type { NodeShape } from './shapes'

export interface NodeStyle {
  shape: NodeShape
  /** Outline only: the node was not read (unreachable or never visited). */
  hollow: boolean
  /** A node that says it is stale is drawn faded. */
  dimmed: boolean
  version: VersionState
  /** Sync-lag arc, 0 to 1 of a full turn; 0 means caught up or unknown. */
  lag: number
}

export type LinkKind = 'active' | 'mirror' | 'known'

export interface LinkStyle {
  kind: LinkKind
  a: string
  b: string
  /** Mirror links only: data flows from `from` (the source) to `to` (the node that copies it). */
  direction?: { from: string; to: string }
  /** Line width in pixels and opacity, from how many samples back the measurement and how much was lost. */
  width: number
  alpha: number
}

const MIN_VISIBLE_LAG = 0.08

export function nodeStyle(f: NodeFacts): NodeStyle {
  return {
    shape: shapeForRoles(f.roles),
    hollow: f.status !== 'visited',
    dimmed: f.stale,
    version: f.versionState,
    lag: f.lagRatio && f.lagRatio > 0 ? Math.max(MIN_VISIBLE_LAG, Math.min(1, f.lagRatio)) : 0,
  }
}

const BASE_WIDTH = 1.5
const MAX_EXTRA_WIDTH = 2
const SAMPLES_FOR_FULL_WIDTH = 50
const MIN_ALPHA = 0.3

/** More samples draw a thicker line; more loss draws a fainter one. Unmeasured links stay at the base look. */
export function linkQuality(link: MergedLink): { width: number; alpha: number } {
  const stats = link.observations.filter((o) => o.kind === 'active').flatMap((o) => (o.latency ? [o.latency] : []))
  if (stats.length === 0) return { width: BASE_WIDTH, alpha: 1 }
  const samples = Math.max(...stats.map((s) => s.samples ?? 0))
  const loss = Math.max(...stats.map((s) => s.loss_ratio ?? 0))
  return {
    width: BASE_WIDTH + MAX_EXTRA_WIDTH * Math.min(1, samples / SAMPLES_FOR_FULL_WIDTH),
    alpha: Math.max(MIN_ALPHA, 1 - Math.min(1, Math.max(0, loss))),
  }
}

/** The lines to draw for one merged link: an active or known line, plus one arrow per mirror direction. */
export function linkStyles(link: MergedLink): LinkStyle[] {
  const out: LinkStyle[] = []
  const has = (kind: LinkKind) => link.observations.some((o) => o.kind === kind)
  if (has('active')) out.push({ kind: 'active', a: link.a, b: link.b, ...linkQuality(link) })
  else if (!has('mirror')) out.push({ kind: 'known', a: link.a, b: link.b, width: 1, alpha: 0.5 })
  const seen = new Set<string>()
  for (const o of link.observations) {
    if (o.kind !== 'mirror' || seen.has(o.from)) continue
    seen.add(o.from)
    out.push({ kind: 'mirror', a: link.a, b: link.b, direction: { from: o.to, to: o.from }, width: BASE_WIDTH, alpha: 1 })
  }
  return out
}
