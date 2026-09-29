<script setup lang="ts">
import styles from '../styles/MotionToggle.module.scss'
import ToggleSwitch from './ToggleSwitch.vue'

defineProps<{ reduced: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <div :class="styles.wrap">
    <ToggleSwitch
      :model-value="reduced"
      label="Reduce motion"
      description="Changes show as static markers instead of pulses."
      data-testid="motion-toggle"
      @update:model-value="$emit('toggle')"
    />
  </div>
</template>
