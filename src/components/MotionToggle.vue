<script setup lang="ts">
import { AvalonToggleSwitch } from '@avalon-initiative/common-ui'
import styles from '../styles/MotionToggle.module.scss'

defineProps<{ reduced: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <div :class="styles.wrap">
    <AvalonToggleSwitch
      :model-value="reduced"
      label="Reduce motion"
      description="Changes show as static markers instead of pulses."
      data-testid="motion-toggle"
      @update:model-value="$emit('toggle')"
    />
  </div>
</template>
