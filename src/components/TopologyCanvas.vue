<script setup lang="ts">
import { ref } from 'vue'
import styles from '../styles/TopologyCanvas.module.scss'
import { useTopologyCanvas } from '../composables/useTopologyCanvas'
import type { Point } from '../utils/layout'
import type { View } from '../utils/viewport'

const props = defineProps<{
  positions: Record<string, Point>
  links: { a: string; b: string }[]
  pinned: ReadonlySet<string>
  view: View
  width: number
  height: number
}>()

const emit = defineEmits<{ pin: [id: string, at: Point]; unpin: [id: string] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const handlers = useTopologyCanvas({
  canvas,
  positions: () => props.positions,
  links: () => props.links,
  pinned: () => props.pinned,
  view: () => props.view,
  width: props.width,
  height: props.height,
  onPin: (id, at) => emit('pin', id, at),
  onUnpin: (id) => emit('unpin', id),
})
</script>

<template>
  <canvas
    ref="canvas"
    :class="styles.canvas"
    :width="width"
    :height="height"
    role="img"
    aria-label="Network graph. Distance between nodes is measured round trip time. Drag a node to pin it; double-click to release it."
    @pointerdown="handlers.onPointerDown"
    @pointermove="handlers.onPointerMove"
    @pointerup="handlers.onPointerUp"
    @dblclick="handlers.onDoubleClick"
  />
</template>
