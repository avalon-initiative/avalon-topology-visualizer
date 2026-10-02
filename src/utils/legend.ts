import type { AvalonLegendGroup } from '@avalon-initiative/common-ui'
import { ROLE_LABELS, shapePoints } from './shapes'
import type { NodeShape } from './shapes'
import type { LinkKind } from './styleGraph'
import type { VersionState } from './nodeFacts'
import type { AlertKind } from './alerts'
import type { ShardKeyItem } from './shardGroups'

export type LegendGlyph =
  | { type: 'link'; kind: LinkKind }
  | { type: 'node'; shape: NodeShape; hollow?: boolean; dimmed?: boolean; version?: VersionState; lag?: number; pinned?: boolean; alert?: AlertKind }
  | { type: 'pulse' }
  | { type: 'shard'; color: number }

export interface LegendItem {
  id: string
  label: string
  glyph: LegendGlyph
}

export interface LegendGroup {
  title: string
  items: LegendItem[]
}

/** Each entry names its mark in words as well as showing it, so nothing depends on colour alone. */
export function legendGroups(shards: ShardKeyItem[] = []): LegendGroup[] {
  const shapes: NodeShape[] = ['square', 'diamond', 'triangle', 'hexagon', 'circle']
  const shardGroup: LegendGroup[] =
    shards.length === 0
      ? []
      : [
          {
            title: 'Shards (dashed outline)',
            items: shards.map((s) => ({ id: `shard-${s.id}`, label: `Shard ${s.id} (nodes inside the dashed outline labelled "shard ${s.id}" serve it)`, glyph: { type: 'shard', color: s.color } as LegendGlyph })),
          },
        ]
  return [
    {
      title: 'Links',
      items: [
        { id: 'active', label: 'Active link (solid line)', glyph: { type: 'link', kind: 'active' } },
        { id: 'mirror', label: 'Mirror source (arrow points to the node that copies it)', glyph: { type: 'link', kind: 'mirror' } },
        { id: 'known', label: 'Known only (faint dashed line)', glyph: { type: 'link', kind: 'known' } },
      ],
    },
    {
      title: 'Node role (shape)',
      items: shapes.map((shape) => ({ id: `role-${shape}`, label: `${ROLE_LABELS[shape]} (${shape})`, glyph: { type: 'node', shape } as LegendGlyph })),
    },
    {
      title: 'Protocol version (ring)',
      items: [
        { id: 'version-newest', label: 'Newest version seen (thin solid ring)', glyph: { type: 'node', shape: 'circle', version: 'newest' } },
        { id: 'version-behind', label: 'Behind the newest (dashed ring)', glyph: { type: 'node', shape: 'circle', version: 'behind' } },
        { id: 'version-unknown', label: 'Version not known (dotted ring)', glyph: { type: 'node', shape: 'circle', version: 'unknown' } },
      ],
    },
    {
      title: 'Node state',
      items: [
        { id: 'stale', label: 'Reports itself stale (faded)', glyph: { type: 'node', shape: 'circle', dimmed: true } },
        { id: 'unread', label: 'Not read: unreachable or not visited (outline only)', glyph: { type: 'node', shape: 'circle', hollow: true } },
        { id: 'lag', label: 'Behind on mirrored data (arc; longer means further behind)', glyph: { type: 'node', shape: 'circle', lag: 0.5 } },
        { id: 'pinned', label: 'Pinned by you (heavy outer ring)', glyph: { type: 'node', shape: 'circle', pinned: true } },
      ],
    },
    {
      title: 'Alerts and changes',
      items: [
        { id: 'alert-equivocation', label: 'Open equivocation finding (red badge marked !)', glyph: { type: 'node', shape: 'circle', alert: 'equivocation' } },
        { id: 'alert-stale', label: 'Node reports itself stale (amber badge marked S)', glyph: { type: 'node', shape: 'circle', alert: 'stale' } },
        { id: 'pulse', label: 'Changed since the last refresh: a node announced or a tree head advanced (a dot runs along the link; with reduced motion, a dashed green line)', glyph: { type: 'pulse' } },
      ],
    },
    ...shardGroup,
  ]
}

export type NodeGlyph = Extract<LegendGlyph, { type: 'node' }>

export interface GlyphGeometry {
  /** SVG polygon points for a shape, or null for a circle. */
  points: string | null
  ring: 'solid' | 'dashed' | 'dotted' | null
  /** SVG path of the sync-lag arc, or null when there is none. */
  lagArc: string | null
}

const GLYPH_RADIUS = 7
export const GLYPH_LAG_RADIUS = 13

/** SVG path for an arc starting at the top and sweeping `fraction` of a turn clockwise. */
export function arcPath(radius: number, fraction: number): string {
  const f = Math.min(0.999, Math.max(0, fraction))
  const end = { x: radius * Math.sin(f * 2 * Math.PI), y: -radius * Math.cos(f * 2 * Math.PI) }
  return `M 0 ${-radius} A ${radius} ${radius} 0 ${f > 0.5 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

export function glyphGeometry(g: NodeGlyph): GlyphGeometry {
  const pts = shapePoints(g.shape, GLYPH_RADIUS)
  return {
    points: pts.length > 0 ? pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') : null,
    ring: g.version === 'newest' ? 'solid' : g.version === 'behind' ? 'dashed' : g.version === 'unknown' ? 'dotted' : null,
    lagArc: g.lag && g.lag > 0 ? arcPath(GLYPH_LAG_RADIUS, g.lag) : null,
  }
}

/** The legend as the shared component's groups; each item's id is the key the glyph slot draws from. */
export function uiLegendGroups(groups: LegendGroup[] = legendGroups()): AvalonLegendGroup[] {
  return groups.map((g) => ({ title: g.title, items: g.items.map((i) => ({ id: i.id, label: i.label })) }))
}

/** Glyph by legend item id, for the glyph slot. */
export function glyphsById(groups: LegendGroup[] = legendGroups()): Record<string, LegendGlyph> {
  return Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.id, i.glyph] as const)))
}
