<script setup lang="ts" generic="Id extends string">
import { AvalonButton } from '@avalon-initiative/common-ui'
import { nextTick } from 'vue'
import styles from '../styles/ToolSidebar.module.scss'
import { tabAfterKey } from '../utils/tabs'
import type { ToolTab } from '../utils/tabs'

const props = defineProps<{ tabs: ToolTab<Id>[] }>()
const active = defineModel<Id>({ required: true })
defineEmits<{ close: [] }>()

const tabId = (id: string) => `tool-tab-${id}`
const panelId = (id: string) => `tool-panel-${id}`

async function onKey(e: KeyboardEvent) {
  const next = tabAfterKey(props.tabs, active.value, e.key)
  if (!next) return
  e.preventDefault()
  active.value = next
  await nextTick()
  document.getElementById(tabId(next))?.focus()
}
</script>

<template>
  <div :class="styles.sidebar">
    <div :class="styles.strip">
      <div :class="styles.tabs" role="tablist" aria-label="Tools" @keydown="onKey">
        <button
          v-for="tab in tabs"
          :id="tabId(tab.id)"
          :key="tab.id"
          type="button"
          role="tab"
          :class="[styles.tab, active === tab.id && styles.current]"
          :aria-selected="active === tab.id"
          :aria-controls="panelId(tab.id)"
          :tabindex="active === tab.id ? 0 : -1"
          :disabled="tab.disabled"
          @click="active = tab.id"
        >
          {{ tab.label }}<span v-if="tab.badge" :class="styles.badge">{{ tab.badge }}</span>
        </button>
      </div>
      <div :class="styles.close"><AvalonButton label="Close" variant="secondary" @click="$emit('close')" /></div>
    </div>
    <div
      v-for="tab in tabs"
      v-show="active === tab.id"
      :id="panelId(tab.id)"
      :key="tab.id"
      role="tabpanel"
      :aria-labelledby="tabId(tab.id)"
      :class="styles.panel"
    >
      <slot :name="tab.id" />
    </div>
  </div>
</template>
