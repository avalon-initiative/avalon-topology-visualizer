import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { MergedGraph } from '../utils/mergeGraph'
import { describeNodes } from '../utils/nodeFacts'
import { nodeDetailRows } from '../utils/nodeDetail'
import { linkStyles, nodeStyle } from '../utils/styleGraph'

/** Per-node and per-link styling for the merged graph, plus which node is selected for the detail panel. */
export function useGraphStyle(merged: Ref<MergedGraph | null>) {
  const selected = ref<string | undefined>()
  const facts = computed(() => (merged.value ? describeNodes(merged.value) : {}))
  const nodeStyles = computed(() => Object.fromEntries(Object.entries(facts.value).map(([url, f]) => [url, nodeStyle(f)])))
  const links = computed(() => (merged.value ? merged.value.links.flatMap(linkStyles) : []))
  const detail = computed(() => {
    const f = selected.value ? facts.value[selected.value] : undefined
    return f && merged.value ? { title: f.url, rows: nodeDetailRows(f, merged.value) } : null
  })

  // A refresh or a new snapshot can drop the selected node.
  watch(merged, (m) => {
    if (selected.value && !m?.nodes.some((n) => n.url === selected.value)) selected.value = undefined
  })

  return { selected, facts, nodeStyles, links, detail }
}
