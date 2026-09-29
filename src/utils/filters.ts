import type { NodeFacts } from './nodeFacts'

export interface Filters {
  roles: string[]
  networkIds: string[]
  versions: string[]
  shards: string[]
  /** Case-insensitive part of a node URL. */
  search: string
}

export type FilterFacet = 'roles' | 'networkIds' | 'versions' | 'shards'

export type FilterMode = 'dim' | 'hide'

export const NO_FILTERS: Filters = { roles: [], networkIds: [], versions: [], shards: [], search: '' }

export function filtersActive(f: Filters): boolean {
  return f.search.trim() !== '' || f.roles.length > 0 || f.networkIds.length > 0 || f.versions.length > 0 || f.shards.length > 0
}

const distinct = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

/** Every value present in the graph for each facet, sorted, to offer as choices. */
export function filterOptions(facts: Record<string, NodeFacts>): Record<FilterFacet, string[]> {
  const all = Object.values(facts)
  return {
    roles: distinct(all.flatMap((f) => f.roles)),
    networkIds: distinct(all.flatMap((f) => (f.networkId ? [f.networkId] : []))),
    versions: distinct(all.flatMap((f) => (f.version ? [f.version] : []))),
    shards: distinct(all.flatMap((f) => f.shards.map((s) => s.id))),
  }
}

const matches = (wanted: string[], have: readonly string[]) => wanted.length === 0 || wanted.some((w) => have.includes(w))

/**
 * The nodes that pass every active filter: within one facet any chosen value may match, across facets all must.
 * A node that did not report an attribute never matches a filter on it. Null when no filter is active.
 */
export function visibleNodes(facts: Record<string, NodeFacts>, filters: Filters): Set<string> | null {
  if (!filtersActive(filters)) return null
  const needle = filters.search.trim().toLowerCase()
  const out = new Set<string>()
  for (const f of Object.values(facts)) {
    if (
      f.url.toLowerCase().includes(needle) &&
      matches(filters.roles, f.roles) &&
      matches(filters.networkIds, f.networkId ? [f.networkId] : []) &&
      matches(filters.versions, f.version ? [f.version] : []) &&
      matches(filters.shards, f.shards.map((s) => s.id))
    ) {
      out.add(f.url)
    }
  }
  return out
}

/** Flips one value of a facet on or off, leaving the rest of the filters as they are. */
export function toggleValue(filters: Filters, facet: FilterFacet, value: string): Filters {
  const has = filters[facet].includes(value)
  return { ...filters, [facet]: has ? filters[facet].filter((v) => v !== value) : [...filters[facet], value] }
}
