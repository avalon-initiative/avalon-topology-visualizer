<script setup lang="ts">
import { AvalonButton } from '@avalon-initiative/common-ui'
import { canZoomIn, canZoomOut, isZoomed, zoomPercent } from '../utils/zoom'
import styles from '../styles/CanvasOverlay.module.scss'

withDefaults(defineProps<{ legendOpen: boolean; panned?: boolean; zoom?: number }>(), { panned: false, zoom: 1 })
defineEmits<{ toggleLegend: []; resetView: []; zoomIn: []; zoomOut: [] }>()
</script>

<template>
  <div :class="styles.overlay">
    <div :class="styles.notices">
      <slot name="notices" />
    </div>
    <div :class="styles.corner">
      <section v-show="legendOpen" id="legend-panel" :class="styles.legend" aria-label="Legend panel">
        <slot name="legend" />
      </section>
      <div :class="styles.row">
        <AvalonButton
          :label="legendOpen ? 'Hide legend' : 'Show legend'"
          variant="secondary"
          aria-controls="legend-panel"
          :aria-expanded="legendOpen"
          @click="$emit('toggleLegend')"
        />
        <AvalonButton label="+" aria-label="Zoom in" variant="secondary" :disabled="!canZoomIn(zoom)" @click="$emit('zoomIn')" />
        <AvalonButton label="−" aria-label="Zoom out" variant="secondary" :disabled="!canZoomOut(zoom)" @click="$emit('zoomOut')" />
        <span :class="styles.zoom" role="status">Zoom {{ zoomPercent(zoom) }}%</span>
        <AvalonButton v-if="panned || isZoomed(zoom)" label="Reset view" variant="secondary" @click="$emit('resetView')" />
        <slot name="scale" />
      </div>
    </div>
  </div>
</template>
