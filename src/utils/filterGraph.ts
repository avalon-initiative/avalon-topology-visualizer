import type { Point } from './layout'
import type { FilterMode } from './filters'
import type { LinkStyle, NodeStyle } from './styleGraph'

export interface GraphDrawing {
  positions: Record<string, Point>
  linkStyles: LinkStyle[]
  nodeStyles: Record<string, NodeStyle>
}

/**
 * Applies a visibility set to what is drawn. Positions come from the layout, which never sees the filters, so
 * the visible nodes stay exactly where they were. A link is visible only when both of its ends are; ids the
 * set does not cover at all (the viewer) count as visible. `dim` fades the rest, `hide` leaves them out.
 */
export function applyVisibility(input: GraphDrawing, visible: ReadonlySet<string> | null, known: ReadonlySet<string>, mode: FilterMode): GraphDrawing {
  if (!visible) return input
  const shown = (id: string) => visible.has(id) || !known.has(id)
  if (mode === 'hide') {
    return {
      positions: Object.fromEntries(Object.entries(input.positions).filter(([id]) => shown(id))),
      linkStyles: input.linkStyles.filter((l) => shown(l.a) && shown(l.b)),
      nodeStyles: Object.fromEntries(Object.entries(input.nodeStyles).filter(([id]) => shown(id))),
    }
  }
  return {
    positions: input.positions,
    linkStyles: input.linkStyles.map((l) => (shown(l.a) && shown(l.b) ? l : { ...l, faded: true })),
    nodeStyles: Object.fromEntries(Object.entries(input.nodeStyles).map(([id, s]) => [id, shown(id) ? s : { ...s, faded: true }])),
  }
}
