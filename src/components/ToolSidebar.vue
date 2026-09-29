<script setup lang="ts" generic="Id extends string">
import { AvalonButton, AvalonTabs } from '@avalon-initiative/common-ui'
import type { AvalonTab } from '@avalon-initiative/common-ui'
import styles from '../styles/ToolSidebar.module.scss'

defineProps<{ tabs: (AvalonTab & { id: Id })[] }>()
const active = defineModel<Id>({ required: true })
defineEmits<{ close: [] }>()
</script>

<template>
  <div :class="styles.sidebar">
    <div :class="styles.close"><AvalonButton label="Close" variant="secondary" @click="$emit('close')" /></div>
    <AvalonTabs v-model="active" :tabs="tabs" label="Tools" :class="styles.tabs">
      <template v-for="tab in tabs" :key="tab.id" #[tab.id]><slot :name="tab.id" /></template>
    </AvalonTabs>
  </div>
</template>
