<script setup lang="ts">
import { ref } from 'vue'
import styles from '../styles/TopologyCanvas.module.scss'
import { useTopologyCanvas } from '../composables/useTopologyCanvas'
import type { TraceDrawing } from '../utils/drawTrace'
import type { Point } from '../utils/layout'
import type { LinkStyle, NodeStyle } from '../utils/styleGraph'
import type { View } from '../utils/viewport'

const props = defineProps<{
  positions: Record<string, Point>
  links: { a: string; b: string }[]
  linkStyles?: LinkStyle[]
  nodeStyles?: Record<string, NodeStyle>
  pinned: ReadonlySet<string>
  selected?: string
  view: View
  trace?: TraceDrawing
  width: number
  height: number
}>()

const emit = defineEmits<{ pin: [id: string, at: Point]; unpin: [id: string]; select: [id: string | undefined] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const handlers = useTopologyCanvas({
  canvas,
  positions: () => props.positions,
  links: () => props.links,
  linkStyles: () => props.linkStyles,
  nodeStyles: () => props.nodeStyles,
  pinned: () => props.pinned,
  selected: () => props.selected,
  view: () => props.view,
  trace: () => props.trace,
  width: props.width,
  height: props.height,
  onPin: (id, at) => emit('pin', id, at),
  onUnpin: (id) => emit('unpin', id),
  onSelect: (id) => emit('select', id),
})
</script>

<template>
  <canvas
    ref="canvas"
    :class="styles.canvas"
    :width="width"
    :height="height"
    role="img"
    aria-label="Network graph. Distance between nodes is measured round trip time. Click a node for details, drag it to pin it, double-click to release it."
    @pointerdown="handlers.onPointerDown"
    @pointermove="handlers.onPointerMove"
    @pointerup="handlers.onPointerUp"
    @dblclick="handlers.onDoubleClick"
  />
</template>
