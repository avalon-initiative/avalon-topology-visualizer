import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import type { Ref } from 'vue'
import { DEFAULT_THEME, drawGraph } from '../utils/drawGraph'
import type { DrawTheme } from '../utils/drawGraph'
import type { Point } from '../utils/layout'
import { nodeAt, toWorld } from '../utils/viewport'
import type { View } from '../utils/viewport'

export interface TopologyCanvasSources {
  canvas: Ref<HTMLCanvasElement | null>
  positions: () => Record<string, Point>
  links: () => { a: string; b: string }[]
  pinned: () => ReadonlySet<string>
  view: () => View
  width: number
  height: number
  onPin: (id: string, at: Point) => void
  onUnpin: (id: string) => void
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
  }
}

/** Draws the graph and lets the viewer drag a node to pin it, or double-click to release it. */
export function useTopologyCanvas(s: TopologyCanvasSources) {
  let theme = DEFAULT_THEME
  let dragging: string | undefined

  onMounted(() => {
    theme = readTheme()
  })

  const stop = watchEffect(() => {
    const ctx = s.canvas.value?.getContext('2d')
    if (!ctx) return
    drawGraph(ctx, {
      positions: s.positions(),
      links: s.links(),
      pinned: s.pinned(),
      view: s.view(),
      width: s.width,
      height: s.height,
      theme,
    })
  })
  onBeforeUnmount(stop)

  const local = (e: PointerEvent): Point => {
    const box = s.canvas.value?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }

  return {
    onPointerDown(e: PointerEvent) {
      dragging = nodeAt(s.positions(), s.view(), local(e))
      if (dragging) s.canvas.value?.setPointerCapture?.(e.pointerId)
    },
    onPointerMove(e: PointerEvent) {
      if (dragging) s.onPin(dragging, toWorld(s.view(), local(e)))
    },
    onPointerUp() {
      dragging = undefined
    },
    onDoubleClick(e: MouseEvent) {
      const id = nodeAt(s.positions(), s.view(), local(e as PointerEvent))
      if (id) s.onUnpin(id)
    },
  }
}
