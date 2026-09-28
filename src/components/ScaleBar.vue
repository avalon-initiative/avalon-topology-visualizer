<script setup lang="ts">
import styles from '../styles/ScaleBar.module.scss'

defineProps<{ px: number; ms: number }>()
</script>

<template>
  <div v-if="ms > 0" :class="styles.scale" data-testid="scale-bar">
    <span :class="styles.bar" :style="{ width: `${px}px` }" />
    <span :class="styles.label">{{ ms }} ms round trip</span>
  </div>
</template>
