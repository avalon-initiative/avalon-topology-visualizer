import type { Point } from './layout'
import { applyPan } from './pan'
import type { Pan } from './pan'
import type { View } from './viewport'

/** Zoom is a multiple of the auto-fitted scale: 1 is the fitted view. */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 12
/** One press of a zoom button or key. */
export const ZOOM_STEP = 1.25

const WHEEL_SENSITIVITY = 0.0015
// Browsers report a trackpad pinch as a wheel event with ctrlKey and much smaller deltas.
const PINCH_WHEEL_SENSITIVITY = 0.01
const LINE_PX = 16
const PAGE_PX = 400
const MAX_WHEEL_PX = 240
const EPSILON = 1e-9

export interface Size {
  width: number
  height: number
}

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
export const isZoomed = (zoom: number): boolean => Math.abs(zoom - 1) > EPSILON
export const canZoomIn = (zoom: number): boolean => zoom < MAX_ZOOM - EPSILON
export const canZoomOut = (zoom: number): boolean => zoom > MIN_ZOOM + EPSILON
export const zoomPercent = (zoom: number): number => Math.round(zoom * 100)

const snap = (v: number): number => (Math.abs(v) < EPSILON ? 0 : v)

/** The zoomed view before any pan: the fitted view scaled about the stage centre, so zooming an unpanned graph keeps it centred. */
export function zoomBase(fitted: View, zoom: number, size: Size): View {
  if (zoom === 1) return fitted
  const cx = size.width / 2
  const cy = size.height / 2
  return { scale: fitted.scale * zoom, tx: cx + (fitted.tx - cx) * zoom, ty: cy + (fitted.ty - cy) * zoom }
}

/**
 * The pan that, at `nextZoom`, keeps the world point under `anchor` (a screen point) where it is at the current
 * `zoom` and `pan`.
 */
export function zoomAt(fitted: View, size: Size, pan: Pan, zoom: number, nextZoom: number, anchor: Point): Pan {
  const current = applyPan(zoomBase(fitted, zoom, size), pan)
  const next = zoomBase(fitted, nextZoom, size)
  const ratio = nextZoom / zoom
  return { dx: snap(anchor.x - (anchor.x - current.tx) * ratio - next.tx), dy: snap(anchor.y - (anchor.y - current.ty) * ratio - next.ty) }
}

export interface WheelInput {
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
}

/** The zoom factor for one wheel event: scrolling up (negative deltaY) zooms in; lines and pages are normalised to pixels. */
export function wheelFactor(e: WheelInput): number {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1
  const px = Math.max(-MAX_WHEEL_PX, Math.min(MAX_WHEEL_PX, e.deltaY * unit))
  return Math.exp(-px * (e.ctrlKey ? PINCH_WHEEL_SENSITIVITY : WHEEL_SENSITIVITY))
}

export interface PinchStep {
  /** Zoom factor between the two finger spreads. */
  factor: number
  /** Midpoint before and after: zoom about `from`, then pan by `to - from`. */
  from: Point
  to: Point
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** How a two-finger gesture moved between two samples. */
export function pinchStep(prev: readonly [Point, Point], next: readonly [Point, Point]): PinchStep {
  const before = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y)
  const after = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y)
  return { factor: before < EPSILON ? 1 : after / before, from: midpoint(prev[0], prev[1]), to: midpoint(next[0], next[1]) }
}
