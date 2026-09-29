import type { AvalonTab } from '@avalon-initiative/common-ui'

export type ToolTabId = 'timelapse' | 'measure' | 'trace' | 'issues'

export interface ToolTabState {
  hasGraph: boolean
  replaying: boolean
  snapshots: number
  /** Alerts plus nodes that were rate limited or unreachable. */
  issues: number
}

/** The sidebar's tabs. Everything but the time-lapse needs a graph; badges are text so state never rides on colour. */
export function toolTabs(s: ToolTabState): (AvalonTab & { id: ToolTabId })[] {
  const needsGraph = !s.hasGraph
  return [
    { id: 'timelapse', label: 'Time-lapse', ...(s.replaying ? { badge: 'Replay' } : s.snapshots > 0 ? { badge: String(s.snapshots) } : {}) },
    { id: 'measure', label: 'Measure', disabled: needsGraph },
    { id: 'trace', label: 'Trace', disabled: needsGraph },
    { id: 'issues', label: 'Alerts', disabled: needsGraph, ...(s.issues > 0 ? { badge: String(s.issues) } : {}) },
  ]
}
