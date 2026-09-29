import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { Point } from '../utils/layout'
import type { MergedGraph } from '../utils/mergeGraph'
import type { NodeFacts } from '../utils/nodeFacts'
import { alertKindsByNode, deriveAlerts } from '../utils/alerts'
import { applyVisibility } from '../utils/filterGraph'
import { filterOptions, filtersActive, NO_FILTERS, toggleValue, visibleNodes } from '../utils/filters'
import type { FilterFacet, FilterMode, Filters } from '../utils/filters'
import type { DetailRow } from '../utils/nodeDetail'
import { nodeReportRows } from '../utils/nodeReport'
import type { LinkStyle, NodeStyle } from '../utils/styleGraph'
import type { RttBook } from '../utils/rttStats'
import { useMotion } from './useMotion'
import { useNodeHistory } from './useNodeHistory'
import { usePulses } from './usePulses'

export interface ExtrasSources {
  merged: Ref<MergedGraph | null>
  facts: Ref<Record<string, NodeFacts>>
  positions: Ref<Record<string, Point>>
  linkStyles: Ref<LinkStyle[]>
  nodeStyles: Ref<Record<string, NodeStyle>>
  selected: Ref<string | undefined>
  viewerBook?: Ref<RttBook>
  /** Pulses reflect refresh-to-refresh changes of a live crawl only; false while a snapshot or replay is shown. Defaults to true. */
  pulsesLive?: Ref<boolean>
}

/** Alerts, filters, pulses, reduced motion and the extra detail rows, layered over the styled graph without touching the layout. */
export function useTopologyExtras(s: ExtrasSources) {
  const alerts = computed(() => deriveAlerts(s.facts.value))
  const kinds = computed(() => alertKindsByNode(alerts.value))

  const filters = ref<Filters>({ ...NO_FILTERS })
  const filterMode = ref<FilterMode>('dim')
  const options = computed(() => filterOptions(s.facts.value))
  const visible = computed(() => visibleNodes(s.facts.value, filters.value))
  const shownCount = computed(() => (visible.value ? visible.value.size : Object.keys(s.facts.value).length))
  const filterOn = computed(() => filtersActive(filters.value))
  const toggleFilter = (facet: FilterFacet, value: string) => {
    filters.value = toggleValue(filters.value, facet, value)
  }
  const clearFilters = () => {
    filters.value = { ...NO_FILTERS }
  }

  const drawing = computed(() => {
    const withAlerts = Object.fromEntries(Object.entries(s.nodeStyles.value).map(([url, st]) => [url, kinds.value[url] ? { ...st, alerts: kinds.value[url] } : st]))
    return applyVisibility({ positions: s.positions.value, linkStyles: s.linkStyles.value, nodeStyles: withAlerts }, visible.value, new Set(Object.keys(s.facts.value)), filterMode.value)
  })

  const motion = useMotion()
  const pulseGraph = computed(() => ((s.pulsesLive?.value ?? true) ? s.merged.value : null))
  const { drawing: pulse } = usePulses(pulseGraph, motion.reduced)
  const history = useNodeHistory(s.merged, s.viewerBook)

  const detailExtra = computed<DetailRow[]>(() => {
    const url = s.selected.value
    const node = url ? s.merged.value?.nodes.find((n) => n.url === url) : undefined
    return node ? [...history.rowsFor(node.url), ...nodeReportRows(node)] : []
  })

  return { alerts, filters, filterMode, options, filterOn, shownCount, toggleFilter, clearFilters, drawing, motion, pulse, detailExtra }
}
