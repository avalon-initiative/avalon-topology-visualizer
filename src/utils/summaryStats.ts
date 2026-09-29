import type { MergedGraph } from './mergeGraph'

export interface SummaryStat {
  label: string
  value: number
  /** The longer explanation, shown as a tooltip. */
  hint: string
}

/** The headline numbers of a walk, as compact label/value pairs. */
export function summaryStats(merged: MergedGraph): SummaryStat[] {
  return [
    { label: 'Nodes visited', value: merged.visited, hint: 'Nodes that answered the walk' },
    { label: 'Not reached', value: merged.unreachable.length + merged.rateLimited.length + merged.unvisited, hint: 'Nodes that were unreachable, rate limited or never visited' },
    { label: 'Links', value: merged.links.length, hint: 'Links between nodes' },
    { label: 'Disputed links', value: merged.disagreements, hint: 'Links the two ends disagree on' },
    { label: 'Groups', value: merged.components.length, hint: 'Separate groups of connected nodes' },
  ]
}
