<script setup lang="ts">
import styles from '../styles/MotionToggle.module.scss'

defineProps<{ reduced: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <label :class="styles.toggle" data-testid="motion-toggle">
    <input type="checkbox" :checked="reduced" @change="$emit('toggle')" />
    Reduce motion (changes show as static markers instead of pulses)
  </label>
</template>
