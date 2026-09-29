<script setup lang="ts">
import styles from '../styles/ToggleSwitch.module.scss'

defineProps<{ modelValue: boolean; label: string; description?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label :class="styles.root">
    <input
      type="checkbox"
      role="switch"
      :class="styles.input"
      :checked="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span :class="styles.track" aria-hidden="true"><span :class="styles.thumb" /></span>
    <span :class="styles.text">
      <span :class="styles.label">{{ label }}</span>
      <span v-if="description" :class="styles.description">{{ description }}</span>
    </span>
    <span :class="styles.state" data-testid="switch-state">{{ modelValue ? 'On' : 'Off' }}</span>
  </label>
</template>
