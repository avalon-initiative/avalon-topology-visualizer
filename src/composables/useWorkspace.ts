import { watch } from 'vue'
import { isWideViewport } from '../utils/breakpoints'
import type { ToolTabId } from '../utils/toolTabs'
import { useDisclosure } from './useDisclosure'
import { useTabs } from './useTabs'

/** Which tools are showing: the walk form (narrow screens), the sidebar (open at first only on wide screens), its active tab, and the legend overlay. */
export function useWorkspace(hasGraph: () => boolean = () => false) {
  const sidebar = useDisclosure(isWideViewport())
  const legend = useDisclosure(false)
  const tabs = useTabs<ToolTabId>('timelapse')
  // Narrow screens fold the walk form away once there is a graph, to leave the map room.
  const controls = useDisclosure(true)
  watch(hasGraph, (has) => (has ? controls.hide() : controls.show()))

  /** Brings a tool into view, e.g. when a drawer action needs it. */
  function reveal(id: ToolTabId) {
    tabs.select(id)
    sidebar.show()
  }

  return { sidebar, legend, controls, tabs, reveal }
}
