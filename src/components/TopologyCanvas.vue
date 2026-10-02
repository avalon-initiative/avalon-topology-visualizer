<script setup lang="ts">
import { ref } from 'vue'
import { useDevicePixelRatio } from '../composables/useDevicePixelRatio'
import styles from '../styles/TopologyCanvas.module.scss'
import { useTopologyCanvas } from '../composables/useTopologyCanvas'
import type { TraceDrawing } from '../utils/drawTrace'
import type { Point } from '../utils/layout'
import type { PulseDrawing } from '../utils/pulses'
import type { ShardKeyItem } from '../utils/shardGroups'
import type { LinkStyle, NodeStyle } from '../utils/styleGraph'
import type { View } from '../utils/viewport'

const props = defineProps<{
  positions: Record<string, Point>
  links: { a: string; b: string }[]
  linkStyles?: LinkStyle[]
  nodeStyles?: Record<string, NodeStyle>
  shardKey?: ShardKeyItem[]
  pinned: ReadonlySet<string>
  selected?: string
  view: View
  trace?: TraceDrawing
  pulse?: PulseDrawing
  width: number
  height: number
}>()

const emit = defineEmits<{
  pin: [id: string, at: Point]
  unpin: [id: string]
  select: [id: string | undefined]
  pan: [dx: number, dy: number]
  zoom: [factor: number, at: Point]
  resetView: []
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const pixelRatio = useDevicePixelRatio()
const handlers = useTopologyCanvas({
  canvas,
  positions: () => props.positions,
  links: () => props.links,
  linkStyles: () => props.linkStyles,
  nodeStyles: () => props.nodeStyles,
  shardKey: () => props.shardKey,
  pinned: () => props.pinned,
  selected: () => props.selected,
  view: () => props.view,
  trace: () => props.trace,
  pulse: () => props.pulse,
  width: () => props.width,
  height: () => props.height,
  pixelRatio: () => pixelRatio.value,
  onPin: (id, at) => emit('pin', id, at),
  onUnpin: (id) => emit('unpin', id),
  onSelect: (id) => emit('select', id),
  onPan: (dx, dy) => emit('pan', dx, dy),
  onZoom: (factor, at) => emit('zoom', factor, at),
  onResetView: () => emit('resetView'),
})
</script>

<template>
  <canvas
    ref="canvas"
    :class="[styles.canvas, styles[handlers.cursor.value]]"
    tabindex="0"
    :style="{ width: `${width}px`, height: `${height}px` }"
    role="img"
    aria-label="Network graph. Distance between nodes is measured round trip time. Click a node for details, drag it to pin it, double-click it to release it. Drag empty space to move the view, scroll or pinch to zoom, double-click empty space to reset it. With the graph focused, arrow keys move the view, plus and minus zoom, and 0 resets it."
    @pointerdown="handlers.onPointerDown"
    @pointermove="handlers.onPointerMove"
    @pointerup="handlers.onPointerUp"
    @pointercancel="handlers.onPointerCancel"
    @keydown="handlers.onKeyDown"
    @pointerleave="handlers.onPointerLeave"
    @wheel.prevent="handlers.onWheel"
    @dblclick="handlers.onDoubleClick"
  />
</template>
