import type { Point } from './layout'

export type NodeShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon'

const BY_ROLE: Record<string, NodeShape> = { settlement: 'square', indexer: 'diamond', realtime: 'triangle', gateway: 'hexagon' }

/** One recognised role gets its own shape; a combined node, several roles, or none is a circle. */
export function shapeForRoles(roles: string[]): NodeShape {
  const named = roles.map((r) => r.toLowerCase())
  if (named.length !== 1) return 'circle'
  return BY_ROLE[named[0]] ?? 'circle'
}

/** Outline of a polygon shape centred on the origin; a circle has no outline (it is drawn as an arc). */
export function shapePoints(shape: NodeShape, r: number): Point[] {
  const regular = (sides: number, start: number) =>
    Array.from({ length: sides }, (_, i) => ({ x: r * Math.cos(start + (i * 2 * Math.PI) / sides), y: r * Math.sin(start + (i * 2 * Math.PI) / sides) }))
  switch (shape) {
    case 'square':
      return [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }]
    case 'diamond':
      return regular(4, -Math.PI / 2).map((p) => ({ x: p.x * 1.15, y: p.y * 1.15 }))
    case 'triangle':
      return regular(3, -Math.PI / 2).map((p) => ({ x: p.x * 1.15, y: p.y * 1.15 }))
    case 'hexagon':
      return regular(6, 0)
    default:
      return []
  }
}

export const ROLE_LABELS: Record<NodeShape, string> = {
  circle: 'Combined or unknown role',
  square: 'Settlement',
  diamond: 'Indexer',
  triangle: 'Realtime',
  hexagon: 'Gateway',
}
