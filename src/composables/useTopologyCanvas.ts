import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import type { Ref } from 'vue'
import { DEFAULT_THEME, drawGraph } from '../utils/drawGraph'
import type { DrawTheme } from '../utils/drawGraph'
import type { Point } from '../utils/layout'
import type { LinkStyle, NodeStyle } from '../utils/styleGraph'
import { nodeAt, toWorld } from '../utils/viewport'
import type { View } from '../utils/viewport'

// A pointer that moves less than this between down and up is a click, not a drag.
const DRAG_THRESHOLD_PX = 4

export interface TopologyCanvasSources {
  canvas: Ref<HTMLCanvasElement | null>
  positions: () => Record<string, Point>
  links: () => { a: string; b: string }[]
  linkStyles: () => LinkStyle[] | undefined
  nodeStyles: () => Record<string, NodeStyle> | undefined
  pinned: () => ReadonlySet<string>
  selected: () => string | undefined
  view: () => View
  width: number
  height: number
  onPin: (id: string, at: Point) => void
  onUnpin: (id: string) => void
  onSelect: (id: string | undefined) => void
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
  }
}

/** Draws the graph. Click selects a node; drag pins it; double-click releases it. */
export function useTopologyCanvas(s: TopologyCanvasSources) {
  let theme = DEFAULT_THEME
  let pressed: { id: string | undefined; from: Point; dragged: boolean } | undefined

  onMounted(() => {
    theme = readTheme()
  })

  const stop = watchEffect(() => {
    const ctx = s.canvas.value?.getContext('2d')
    if (!ctx) return
    drawGraph(ctx, {
      positions: s.positions(),
      links: s.links(),
      linkStyles: s.linkStyles(),
      nodeStyles: s.nodeStyles(),
      pinned: s.pinned(),
      selected: s.selected(),
      view: s.view(),
      width: s.width,
      height: s.height,
      theme,
    })
  })
  onBeforeUnmount(stop)

  const local = (e: MouseEvent): Point => {
    const box = s.canvas.value?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }

  return {
    onPointerDown(e: PointerEvent) {
      const at = local(e)
      pressed = { id: nodeAt(s.positions(), s.view(), at), from: at, dragged: false }
      if (pressed.id) s.canvas.value?.setPointerCapture?.(e.pointerId)
    },
    onPointerMove(e: PointerEvent) {
      if (!pressed?.id) return
      const at = local(e)
      if (!pressed.dragged && Math.hypot(at.x - pressed.from.x, at.y - pressed.from.y) < DRAG_THRESHOLD_PX) return
      pressed.dragged = true
      s.onPin(pressed.id, toWorld(s.view(), at))
    },
    onPointerUp() {
      if (pressed && !pressed.dragged) s.onSelect(pressed.id)
      pressed = undefined
    },
    onDoubleClick(e: MouseEvent) {
      const id = nodeAt(s.positions(), s.view(), local(e))
      if (id) s.onUnpin(id)
    },
  }
}
