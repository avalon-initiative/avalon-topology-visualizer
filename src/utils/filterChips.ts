import type { AvalonMultiSelectOption } from '@avalon-initiative/common-ui'
import { toggleValue } from './filters'
import type { FilterFacet, Filters } from './filters'
import { shortValue } from './shortValue'

/** `selectAll` marks the facets that can hold many values, where ticking every match at once helps. */
export const FACETS: { key: FilterFacet; label: string; selectAll: boolean }[] = [
  { key: 'roles', label: 'Role', selectAll: false },
  { key: 'networkIds', label: 'Network', selectAll: false },
  { key: 'versions', label: 'Version', selectAll: true },
  { key: 'shards', label: 'Shard', selectAll: true },
]

/** A facet's values as multi-select options; a long value gets a shortened label and keeps the full value as its tooltip. */
export function facetOptions(values: string[]): AvalonMultiSelectOption[] {
  return values.map((value) => {
    const label = shortValue(value)
    return label === value ? { value, label } : { value, label, title: value }
  })
}

/** Replaces one facet's chosen values (what a multi-select emits), leaving the other facets and the search alone. */
export function setFacet(filters: Filters, facet: FilterFacet, values: string[]): Filters {
  return { ...filters, [facet]: [...values] }
}

export interface FilterChip {
  id: string
  /** The facet the value belongs to, or 'search' for the URL text. */
  facet: FilterFacet | 'search'
  value: string
  label: string
  /** The full text when the label is shortened. */
  title?: string
}

/** One chip per active value across every facet, in facet order, then one for the search text. */
export function filterChips(filters: Filters): FilterChip[] {
  const chips: FilterChip[] = FACETS.flatMap(({ key, label }) =>
    filters[key].map((value): FilterChip => {
      const short = shortValue(value)
      return { id: `${key}:${value}`, facet: key, value, label: `${label}: ${short}`, ...(short === value ? {} : { title: `${label}: ${value}` }) }
    }),
  )
  const search = filters.search.trim()
  if (search) chips.push({ id: 'search', facet: 'search', value: search, label: `URL: ${search}` })
  return chips
}

/** Filters without the value (or search text) the chip stands for; nothing else changes. */
export function withoutChip(filters: Filters, chip: FilterChip): Filters {
  if (chip.facet === 'search') return { ...filters, search: '' }
  return filters[chip.facet].includes(chip.value) ? toggleValue(filters, chip.facet, chip.value) : filters
}

/** How many values and search texts are active, for the collapsed narrow-screen toggle. */
export function activeFilterCount(filters: Filters): number {
  return filterChips(filters).length
}
