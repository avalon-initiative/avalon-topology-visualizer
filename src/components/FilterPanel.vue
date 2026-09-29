<script setup lang="ts">
import { AvalonButton, AvalonTextField } from '@avalon-initiative/common-ui'
import type { FilterFacet, FilterMode, Filters } from '../utils/filters'
import styles from '../styles/FilterPanel.module.scss'

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
    <AvalonTextField :model-value="filters.search" label="Search by URL" placeholder="host or part of a URL" @update:model-value="$emit('search', $event)" />
    <fieldset v-for="facet in facets" v-show="options[facet.key].length" :key="facet.key" :class="styles.facet">
      <legend :class="styles.legend">{{ facet.label }}</legend>
      <label v-for="value in options[facet.key]" :key="value" :class="styles.choice">
        <input type="checkbox" :checked="filters[facet.key].includes(value)" @change="$emit('toggle', facet.key, value)" />
        {{ value }}
      </label>
    </fieldset>
    <div :class="styles.footer">
      <label :class="styles.choice">
        <input type="checkbox" :checked="mode === 'hide'" @change="$emit('mode', mode === 'hide' ? 'dim' : 'hide')" />
        Hide filtered nodes instead of dimming them
      </label>
      <span :class="styles.count" role="status">Showing {{ shown }} of {{ total }} nodes</span>
      <AvalonButton v-if="active" label="Clear filters" variant="secondary" @click="$emit('clear')" />
    </div>
  </section>
</template>
