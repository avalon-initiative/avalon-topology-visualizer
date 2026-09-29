import type { ToolTab } from './tabs'

export type ToolTabId = 'timelapse' | 'filters' | 'measure' | 'trace' | 'issues'

export interface ToolTabState {
  hasGraph: boolean
  replaying: boolean
  snapshots: number
  filtersOn: boolean
  /** Alerts plus nodes that were rate limited or unreachable. */
  issues: number
}

/** The sidebar's tabs. Everything but the time-lapse needs a graph; badges are text so state never rides on colour. */
export function toolTabs(s: ToolTabState): ToolTab<ToolTabId>[] {
  const needsGraph = !s.hasGraph
  return [
    { id: 'timelapse', label: 'Time-lapse', ...(s.replaying ? { badge: 'Replay' } : s.snapshots > 0 ? { badge: String(s.snapshots) } : {}) },
    { id: 'filters', label: 'Filters', disabled: needsGraph, ...(s.filtersOn ? { badge: 'On' } : {}) },
    { id: 'measure', label: 'Measure', disabled: needsGraph },
    { id: 'trace', label: 'Trace', disabled: needsGraph },
    { id: 'issues', label: 'Alerts', disabled: needsGraph, ...(s.issues > 0 ? { badge: String(s.issues) } : {}) },
  ]
}
