<script setup lang="ts">
import { AvalonButton, AvalonTextField, AvalonToggleSwitch } from '@avalon-initiative/common-ui'
import type { FilterFacet, FilterMode, Filters } from '../utils/filters'
import styles from '../styles/FilterPanel.module.scss'
import { shortValue } from '../utils/shortValue'

defineProps<{
  filters: Filters
  options: Record<FilterFacet, string[]>
  mode: FilterMode
  active: boolean
  shown: number
  total: number
}>()
defineEmits<{ toggle: [facet: FilterFacet, value: string]; search: [text: string]; mode: [mode: FilterMode]; clear: [] }>()

const facets: { key: FilterFacet; label: string }[] = [
  { key: 'roles', label: 'Role' },
  { key: 'networkIds', label: 'Network id' },
  { key: 'versions', label: 'Protocol version' },
  { key: 'shards', label: 'Shard' },
]
</script>

<template>
  <section :class="styles.panel" aria-label="Filters" data-testid="filters">
    <div :class="styles.summary">
      <span :class="styles.count" role="status">Showing {{ shown }} of {{ total }} nodes</span>
      <AvalonButton v-if="active" label="Clear filters" variant="secondary" @click="$emit('clear')" />
    </div>
    <AvalonTextField :model-value="filters.search" label="Search by URL" placeholder="host or part of a URL" @update:model-value="$emit('search', $event)" />
    <fieldset v-for="facet in facets" v-show="options[facet.key].length" :key="facet.key" :class="styles.facet">
      <legend :class="styles.legend">{{ facet.label }}</legend>
      <label v-for="value in options[facet.key]" :key="value" :class="styles.choice" :title="value">
        <input type="checkbox" :checked="filters[facet.key].includes(value)" @change="$emit('toggle', facet.key, value)" />
        {{ shortValue(value) }}
      </label>
    </fieldset>
    <p :class="styles.hint">Pick values to keep. A node must match every group you use, and any one value within a group.</p>
    <AvalonToggleSwitch
      :model-value="mode === 'hide'"
      label="Hide non-matching nodes"
      :description="mode === 'hide' ? 'Non-matching nodes are removed from the map.' : 'Non-matching nodes stay on the map, dimmed.'"
      data-testid="hide-toggle"
      @update:model-value="$emit('mode', $event ? 'hide' : 'dim')"
    />
  </section>
</template>
