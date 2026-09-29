<script setup lang="ts">
import { AvalonButton, AvalonChipList, AvalonMultiSelect, AvalonTextField, AvalonToggleSwitch } from '@avalon-initiative/common-ui'
import { computed } from 'vue'
import { useDisclosure } from '../composables/useDisclosure'
import styles from '../styles/FilterBar.module.scss'
import { facetOptions, FACETS, filterChips } from '../utils/filterChips'
import type { FilterChip } from '../utils/filterChips'
import type { FilterFacet, FilterMode, Filters } from '../utils/filters'

const props = defineProps<{
  filters: Filters
  options: Record<FilterFacet, string[]>
  mode: FilterMode
  active: boolean
  shown: number
  total: number
}>()
const emit = defineEmits<{ facet: [facet: FilterFacet, values: string[]]; search: [text: string]; removeChip: [chip: FilterChip]; mode: [mode: FilterMode]; clear: [] }>()

// Narrow screens fold everything but the search and count behind a toggle.
const expanded = useDisclosure(false)
const chips = computed(() => filterChips(props.filters))
const facets = computed(() => FACETS.filter((f) => props.options[f.key].length > 0).map((f) => ({ ...f, options: facetOptions(props.options[f.key]) })))
const chipItems = computed(() => chips.value.map(({ id, label, title }) => ({ id, label, title })))
const removeChip = (id: string) => {
  const chip = chips.value.find((c) => c.id === id)
  if (chip) emit('removeChip', chip)
}
const toggleLabel = computed(() => (chips.value.length > 0 ? `Filters (${chips.value.length} active)` : 'Filters'))
</script>

<template>
  <section :class="styles.bar" aria-label="Filters" data-testid="filters">
    <div :class="styles.row">
      <div :class="styles.search">
        <AvalonTextField :model-value="filters.search" label="Search by URL" label-hidden placeholder="host or part of a URL" @update:model-value="$emit('search', $event)" />
      </div>
      <div :class="styles.toggle">
        <AvalonButton :label="toggleLabel" variant="secondary" aria-controls="filter-panel" :aria-expanded="expanded.open.value" @click="expanded.toggle" />
      </div>
      <p :class="styles.count" role="status">Showing {{ shown }} of {{ total }} nodes</p>
      <div id="filter-panel" :class="[styles.panel, !expanded.open.value && styles.folded]">
        <div :class="styles.facets">
          <AvalonMultiSelect
            v-for="facet in facets"
            :key="facet.key"
            :model-value="filters[facet.key]"
            :options="facet.options"
            :label="facet.label"
            :select-all="facet.selectAll"
            :search-placeholder="`Find a ${facet.label.toLowerCase()}`"
            @update:model-value="$emit('facet', facet.key, $event)"
          />
        </div>
        <div :class="styles.extras">
          <AvalonButton v-if="active" label="Clear filters" variant="secondary" @click="$emit('clear')" />
          <AvalonToggleSwitch
            :model-value="mode === 'hide'"
            label="Hide non-matching nodes"
            compact
            :show-state="false"
            :description="mode === 'hide' ? 'Non-matching nodes are removed from the map.' : 'Non-matching nodes stay on the map, dimmed.'"
            data-testid="hide-toggle"
            @update:model-value="$emit('mode', $event ? 'hide' : 'dim')"
          />
        </div>
        <AvalonChipList :items="chipItems" label="Active filters" :class="styles.chips" data-testid="filter-chips" @remove="removeChip" />
      </div>
    </div>
  </section>
</template>
