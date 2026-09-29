<script setup lang="ts">
import { AvalonButton } from '@avalon-initiative/common-ui'
import styles from '../styles/CanvasOverlay.module.scss'

defineProps<{ legendOpen: boolean }>()
defineEmits<{ toggleLegend: [] }>()
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
        <slot name="scale" />
      </div>
    </div>
  </div>
</template>
