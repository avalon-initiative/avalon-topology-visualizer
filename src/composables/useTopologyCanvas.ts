import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import type { Ref } from 'vue'
import { DEFAULT_THEME, drawGraph } from '../utils/drawGraph'
import type { DrawTheme } from '../utils/drawGraph'
import type { TraceDrawing } from '../utils/drawTrace'
import type { Point } from '../utils/layout'
import type { PulseDrawing } from '../utils/pulses'
import type { ShardKeyItem } from '../utils/shardGroups'
import { readShardPalette } from '../utils/shardPalette'
import type { LinkStyle, NodeStyle } from '../utils/styleGraph'
import { nodeAt, toWorld } from '../utils/viewport'
import type { View } from '../utils/viewport'
import { pinchStep, wheelFactor, ZOOM_STEP } from '../utils/zoom'

// A pointer that moves less than this between down and up is a click, not a drag.
const DRAG_THRESHOLD_PX = 4
const KEY_STEP_PX = 40
const KEY_STEP_FAST_PX = 120
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

const ZOOM_KEYS: Record<string, number> = { '+': ZOOM_STEP, '=': ZOOM_STEP, '-': 1 / ZOOM_STEP, _: 1 / ZOOM_STEP }

export interface TopologyCanvasSources {
  canvas: Ref<HTMLCanvasElement | null>
  positions: () => Record<string, Point>
  links: () => { a: string; b: string }[]
  linkStyles: () => LinkStyle[] | undefined
  nodeStyles: () => Record<string, NodeStyle> | undefined
  shardKey?: () => ShardKeyItem[] | undefined
  pinned: () => ReadonlySet<string>
  selected: () => string | undefined
  view: () => View
  trace?: () => TraceDrawing | undefined
  pulse?: () => PulseDrawing | undefined
  /** CSS pixels; the backing store is scaled by `pixelRatio` so drawing stays crisp on dense screens. */
  width: () => number
  height: () => number
  pixelRatio?: () => number
  onPin: (id: string, at: Point) => void
  onUnpin: (id: string) => void
  onSelect: (id: string | undefined) => void
  /** Screen-pixel deltas: the view should move by this much (content follows the pointer 1:1). */
  onPan: (dx: number, dy: number) => void
  /** Multiply the zoom by `factor`, keeping the world point under the screen point `at` where it is. */
  onZoom: (factor: number, at: Point) => void
  onResetView: () => void
}

function readTheme(): DrawTheme {
  const css = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    link: pick('--av-color-border-strong', DEFAULT_THEME.link),
    node: pick('--av-color-primary', DEFAULT_THEME.node),
    pinned: pick('--av-color-warning', DEFAULT_THEME.pinned),
    label: pick('--av-color-text', DEFAULT_THEME.label),
    background: DEFAULT_THEME.background,
    mirror: pick('--av-color-accent-secondary', DEFAULT_THEME.mirror),
    warning: pick('--av-color-warning', DEFAULT_THEME.warning),
    danger: pick('--av-color-danger', DEFAULT_THEME.danger),
    success: pick('--av-color-success', DEFAULT_THEME.success),
    muted: pick('--av-color-text-muted', DEFAULT_THEME.muted),
    badgeText: pick('--av-color-bg', DEFAULT_THEME.badgeText),
    halo: pick('--av-color-bg', DEFAULT_THEME.halo),
    shardPalette: readShardPalette(pick),
  }
}

/** Draws the graph. Click selects a node; drag pins it; drag on empty space pans; wheel or two-finger pinch zooms; double-click releases a pin or resets the view. */
export function useTopologyCanvas(s: TopologyCanvasSources) {
  let theme = DEFAULT_THEME
  const hovered = ref<string | undefined>()
  const labelMemory = new Map<string, string>()
  const panning = ref(false)
  // Every pointer that is down, by id; a second one turns the press into a pinch.
  const down = new Map<number, Point>()
  let pinch: [number, number] | undefined
  let pressed: { id: string | undefined; pointer: number; from: Point; last: Point; dragged: boolean } | undefined

  onMounted(() => {
    theme = readTheme()
  })

  const stop = watchEffect(() => {
    const canvas = s.canvas.value
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = s.width()
    const height = s.height()
    const ratio = s.pixelRatio?.() ?? 1
    // Assigning the size clears the canvas, so only do it when it changes.
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio)
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawGraph(ctx, {
      positions: s.positions(),
      links: s.links(),
      linkStyles: s.linkStyles(),
      nodeStyles: s.nodeStyles(),
      shardKey: s.shardKey?.(),
      pinned: s.pinned(),
      selected: s.selected(),
      hovered: hovered.value,
      labelMemory,
      view: s.view(),
      trace: s.trace?.(),
      pulse: s.pulse?.(),
      width,
      height,
      theme,
    })
  })
  onBeforeUnmount(stop)

  const local = (e: MouseEvent): Point => {
    const box = s.canvas.value?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }

  const cursor = computed<'grab' | 'grabbing' | 'pointer'>(() => (panning.value ? 'grabbing' : hovered.value ? 'pointer' : 'grab'))

  function end(e: PointerEvent) {
    s.canvas.value?.releasePointerCapture?.(e.pointerId)
    down.clear()
    pressed = undefined
    pinch = undefined
    panning.value = false
  }

  function pinchMove(e: PointerEvent, at: Point, ids: [number, number]) {
    if (!down.has(e.pointerId)) return
    const before: [Point, Point] = [down.get(ids[0])!, down.get(ids[1])!]
    down.set(e.pointerId, at)
    const step = pinchStep(before, [down.get(ids[0])!, down.get(ids[1])!])
    if (step.factor !== 1) s.onZoom(step.factor, step.from)
    if (step.to.x !== step.from.x || step.to.y !== step.from.y) s.onPan(step.to.x - step.from.x, step.to.y - step.from.y)
  }

  const centre = (): Point => ({ x: s.width() / 2, y: s.height() / 2 })

  return {
    cursor,
    onPointerDown(e: PointerEvent) {
      if (pinch) return
      const at = local(e)
      if (pressed && e.pointerId !== pressed.pointer) {
        // A second finger: the press stops being a click, drag or pin and becomes a pinch.
        pinch = [pressed.pointer, e.pointerId]
        pressed = undefined
        down.set(e.pointerId, at)
        panning.value = true
        hovered.value = undefined
        s.canvas.value?.setPointerCapture?.(e.pointerId)
        return
      }
      if (pressed) return
      pressed = { id: nodeAt(s.positions(), s.view(), at), pointer: e.pointerId, from: at, last: at, dragged: false }
      down.set(e.pointerId, at)
      s.canvas.value?.setPointerCapture?.(e.pointerId)
    },
    onPointerMove(e: PointerEvent) {
      const at = local(e)
      if (pinch) return pinchMove(e, at, pinch)
      if (!pressed) {
        hovered.value = nodeAt(s.positions(), s.view(), at)
        return
      }
      if (e.pointerId !== pressed.pointer) return
      down.set(e.pointerId, at)
      if (!pressed.dragged && Math.hypot(at.x - pressed.from.x, at.y - pressed.from.y) < DRAG_THRESHOLD_PX) return
      pressed.dragged = true
      if (pressed.id) {
        s.onPin(pressed.id, toWorld(s.view(), at))
        return
      }
      // `last` starts at the press point, so the first delta includes the threshold distance and nothing jumps.
      hovered.value = undefined
      panning.value = true
      s.onPan(at.x - pressed.last.x, at.y - pressed.last.y)
      pressed.last = at
    },
    onPointerLeave() {
      hovered.value = undefined
    },
    onPointerUp(e: PointerEvent) {
      if (pinch) {
        if (!pinch.includes(e.pointerId)) return
        // One finger lifts: the other carries on as a plain pan from where it is, so nothing jumps and nothing selects.
        const left = pinch[0] === e.pointerId ? pinch[1] : pinch[0]
        const at = down.get(left)!
        s.canvas.value?.releasePointerCapture?.(e.pointerId)
        down.delete(e.pointerId)
        pinch = undefined
        pressed = { id: undefined, pointer: left, from: at, last: at, dragged: true }
        return
      }
      if (pressed && e.pointerId !== pressed.pointer) return
      if (pressed && !pressed.dragged) s.onSelect(pressed.id)
      end(e)
    },
    onPointerCancel(e: PointerEvent) {
      if (pressed && !pinch && e.pointerId !== pressed.pointer) return
      if (pinch) s.canvas.value?.releasePointerCapture?.(pinch[0] === e.pointerId ? pinch[1] : pinch[0])
      end(e)
    },
    onWheel(e: WheelEvent) {
      const factor = wheelFactor(e)
      if (factor !== 1) s.onZoom(factor, local(e))
    },
    onDoubleClick(e: MouseEvent) {
      const id = nodeAt(s.positions(), s.view(), local(e))
      if (id) s.onUnpin(id)
      else s.onResetView()
    },
    onKeyDown(e: KeyboardEvent) {
      if (e.key === '0') return s.onResetView()
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const zoom = ZOOM_KEYS[e.key]
        if (zoom) {
          e.preventDefault()
          return s.onZoom(zoom, centre())
        }
      }
      const dir = ARROWS[e.key]
      if (!dir) return
      e.preventDefault()
      const step = e.shiftKey ? KEY_STEP_FAST_PX : KEY_STEP_PX
      // The view moves in the arrow's direction, so the graph shifts the other way.
      s.onPan(-dir[0] * step || 0, -dir[1] * step || 0)
    },
  }
}
