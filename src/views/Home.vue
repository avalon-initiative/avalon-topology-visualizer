<script setup lang="ts">
import { AvalonIssueList, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import { computed, onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import CanvasOverlay from '../components/CanvasOverlay.vue'
import DetailDrawer from '../components/DetailDrawer.vue'
import FilterBar from '../components/FilterBar.vue'
import GraphLegend from '../components/GraphLegend.vue'
import ProbePanel from '../components/ProbePanel.vue'
import ScaleBar from '../components/ScaleBar.vue'
import TimelinePanel from '../components/TimelinePanel.vue'
import ToolSidebar from '../components/ToolSidebar.vue'
import TopBar from '../components/TopBar.vue'
import TopologyCanvas from '../components/TopologyCanvas.vue'
import TracePanel from '../components/TracePanel.vue'
import ViewerRttPanel from '../components/ViewerRttPanel.vue'
import styles from '../styles/Home.module.scss'
import { useCrawler } from '../composables/useCrawler'
import { useCrawlerForm } from '../composables/useCrawlerForm'
import { useElementSize } from '../composables/useElementSize'
import { useGraphStyle } from '../composables/useGraphStyle'
import { useZoomView } from '../composables/useZoomView'
import { useScaleBar } from '../composables/useScaleBar'
import { useLayout } from '../composables/useLayout'
import { useProbe } from '../composables/useProbe'
import { useSelectionDrawer } from '../composables/useSelectionDrawer'
import { useTimelapse } from '../composables/useTimelapse'
import { useTopologyExtras } from '../composables/useTopologyExtras'
import { useTrace } from '../composables/useTrace'
import { useTweenedPositions } from '../composables/useTweenedPositions'
import { useViewerRtt } from '../composables/useViewerRtt'
import { useWorkspace } from '../composables/useWorkspace'
import { describeFailure } from '../utils/describeFailure'
import { onScreen } from '../utils/viewport'
import { alertIssues, alertUrl, nodeIssues } from '../utils/issueItems'
import { summaryStats } from '../utils/summaryStats'
import { toolTabs } from '../utils/toolTabs'

const crawler = useCrawler()
const { phase, progress, error, takenAt, isLive } = crawler
const timelapse = useTimelapse(crawler)
// The graph on screen: the live crawl, or the snapshot being replayed.
const merged = timelapse.shown
const stage = ref<HTMLElement | null>(null)
const { size } = useElementSize(stage)
const viewerRtt = useViewerRtt(merged)
const probe = useProbe(merged, () => selected.value)
const extraLayoutLinks = computed(() => [...viewerRtt.links.value, ...probe.links.value])
const extraDrawLinks = computed(() => [...viewerRtt.drawLinks.value, ...probe.drawLinks.value])
const { layout, pinned, pin, unpin } = useLayout(merged, extraLayoutLinks, size)
const { selected, facts, nodeStyles, links: linkStyles, detail } = useGraphStyle(merged, extraDrawLinks)
const animated = useTweenedPositions(computed(() => layout.value?.positions), timelapse.replaying, () => size.value.width, () => size.value.height)
// The one view everything uses: the auto-fit plus the user's zoom and pan. The scale bar reads it too, so it stays true.
const zoomView = useZoomView({ fitted: () => animated.view.value, positions: () => animated.positions.value, size: () => size.value })
const view = zoomView.view
const bar = useScaleBar(layout, view)
const extras = useTopologyExtras({
  merged,
  facts,
  positions: computed(() => animated.positions.value ?? {}),
  linkStyles,
  nodeStyles,
  selected,
  viewerBook: viewerRtt.book,
  pulsesLive: computed(() => isLive.value && !timelapse.replaying.value),
})
const { seedUrl, refreshSeconds, networks, selectedNetwork, loadNetworks, walkNetwork, walk, onFile, save } = useCrawlerForm(crawler, import.meta.env.VITE_AVALON_SEED_URL ?? '')
onMounted(loadNetworks)
const tracer = useTrace({
  target: selected,
  defaultEntry: () => seedUrl.value,
  positions: () => extras.drawing.value.positions,
  scale: () => view.value.scale,
  onScreen: (p) => onScreen(view.value, p, size.value),
})

const workspace = useWorkspace(() => merged.value !== null)
const drawer = useSelectionDrawer(selected, detail)
const nodeAlerts = computed(() => extras.alerts.value.filter((a) => a.url === selected.value))
const rateLimited = computed(() => merged.value?.rateLimited.map((n) => ({ url: n.url, reason: describeFailure(n.failure), detail: n.failure.message })) ?? [])
const unreachable = computed(() => merged.value?.unreachable.map((n) => ({ url: n.url, reason: describeFailure(n.failure), detail: n.failure.message })) ?? [])
const issueCount = computed(() => extras.alerts.value.length + rateLimited.value.length + unreachable.value.length)
const tabs = computed(() =>
  toolTabs({
    hasGraph: merged.value !== null,
    replaying: timelapse.replaying.value,
    snapshots: timelapse.markers.value.length,
    issues: issueCount.value,
  }),
)
const stats = computed(() => (merged.value ? summaryStats(merged.value) : []))
const status = computed(() => {
  if (phase.value === 'walking') return `Walking: ${progress.value.visited} of ${progress.value.discovered} nodes visited`
  if (merged.value && !timelapse.replaying.value) return `${isLive.value ? 'Live walk' : 'Snapshot'} from ${takenAt.value?.toLocaleString()}`
  return ''
})

function traceHere() {
  workspace.reveal('trace')
  tracer.trace()
}
function probeFirst() {
  workspace.reveal('measure')
  probe.pickFirst()
}
function probeSecond() {
  workspace.reveal('measure')
  probe.pickSecond()
}
</script>

<template>
  <AppShell :sidebar-open="workspace.sidebar.open.value" :drawer-open="drawer.isOpen()">
    <template #topbar>
      <TopBar
        v-model:seed-url="seedUrl"
        v-model:refresh-seconds="refreshSeconds"
        :walking="phase === 'walking'"
        :networks="networks"
        :selected-network="selectedNetwork"
        :has-graph="merged !== null"
        :tools-open="workspace.sidebar.open.value"
        :controls-open="workspace.controls.open.value"
        :status="status"
        :stats="stats"
        :reduced-motion="extras.motion.reduced.value"
        @network="walkNetwork"
        @walk="walk"
        @stop="crawler.stop"
        @save="save"
        @file="onFile"
        @toggle-tools="workspace.sidebar.toggle"
        @toggle-controls="workspace.controls.toggle"
        @toggle-motion="extras.motion.toggle"
      />
    </template>

    <template #sidebar>
      <ToolSidebar v-model="workspace.tabs.active.value" :tabs="tabs" @close="workspace.sidebar.hide">
        <template #timelapse>
          <TimelinePanel
            :markers="timelapse.markers.value"
            :index="timelapse.replaying.value ? timelapse.index.value : null"
            :playing="timelapse.playing.value"
            :diff="timelapse.currentDiff.value"
            :error="timelapse.error.value"
            :saved="timelapse.saved.value"
            @seek="timelapse.seek"
            @step="timelapse.step"
            @live="timelapse.goLive"
            @play="timelapse.play"
            @pause="timelapse.pause"
            @export="timelapse.exportHistory"
            @clear="timelapse.clear"
            @import-file="timelapse.onImportFile"
          />
        </template>
        <template #measure>
          <template v-if="merged">
            <ViewerRttPanel :summaries="viewerRtt.summaries.value" :ranking="viewerRtt.ranking.value" :running="viewerRtt.running.value" @toggle="viewerRtt.toggle" />
            <ProbePanel
              :from="probe.from.value"
              :to="probe.to.value"
              :selected="selected"
              :busy="probe.busy.value"
              :can-probe="probe.canProbe.value"
              :can-random="probe.canRandom.value"
              :cooldown="probe.cooldown.value"
              :message="probe.message.value"
              :last="probe.last.value"
              :probes="probe.probes.value"
              @pick-first="probe.pickFirst"
              @pick-second="probe.pickSecond"
              @measure="probe.measure"
              @random="probe.measureRandom"
            />
          </template>
        </template>
        <template #trace>
          <TracePanel
            v-if="merged"
            v-model:entry="tracer.entryInput.value"
            :entry-placeholder="seedUrl"
            :target="tracer.target.value"
            :selected="selected"
            :active-hop="tracer.hop.value"
            :loading="tracer.loading.value"
            :error="tracer.error.value"
            :summary="tracer.summary.value"
            :playback="tracer.playback.value"
            @pick-entry="tracer.pickEntry"
            @pick-target="tracer.pickTarget"
            @swap="tracer.swap"
            @trace="tracer.trace"
            @clear="tracer.clear"
            @replay="tracer.replay"
            @pause="tracer.togglePause"
            @speed="tracer.changeSpeed"
          />
        </template>
        <template #issues>
          <template v-if="merged">
            <AvalonIssueList title="Alerts" label="Alerts" :items="alertIssues(extras.alerts.value)" selectable data-testid="alerts" @select="selected = alertUrl(extras.alerts.value, $event) ?? selected" />
            <AvalonIssueList title="Rate limited" :items="nodeIssues(rateLimited, 'warning')" />
            <AvalonIssueList title="Unreachable" :items="nodeIssues(unreachable, 'danger')" />
            <p v-if="issueCount === 0" :class="styles.note" data-testid="no-issues">No alerts and no unreachable nodes.</p>
          </template>
        </template>
      </ToolSidebar>
    </template>

    <div :class="styles.workspace">
      <FilterBar
        v-if="merged"
        :filters="extras.filters.value"
        :options="extras.options.value"
        :mode="extras.filterMode.value"
        :active="extras.filterOn.value"
        :shown="extras.shownCount.value"
        :total="merged.nodes.length"
        @facet="extras.setFacetValues"
        @search="extras.setSearch"
        @remove-chip="extras.removeChip"
        @mode="extras.filterMode.value = $event"
        @clear="extras.clearFilters"
      />
      <div ref="stage" :class="styles.stage">
        <TopologyCanvas
          v-if="layout && merged"
          :positions="extras.drawing.value.positions"
          :links="[...merged.links, ...viewerRtt.drawLinks.value]"
          :link-styles="extras.drawing.value.linkStyles"
          :node-styles="extras.drawing.value.nodeStyles"
          :pulse="extras.pulse.value"
          :pinned="pinned"
          :selected="selected"
          :view="view"
          :trace="tracer.drawing.value"
          :width="size.width"
          :height="size.height"
          @pin="pin"
          @unpin="unpin"
          @select="selected = $event"
          @pan="zoomView.panBy"
          @zoom="zoomView.zoomBy"
          @reset-view="zoomView.reset"
        />
        <p v-else :class="styles.empty">Choose a network to walk it, enter a seed node URL, or open a saved snapshot.</p>

        <CanvasOverlay
          :legend-open="workspace.legend.open.value"
          :panned="zoomView.panned.value"
          :zoom="zoomView.zoom.value"
          @toggle-legend="workspace.legend.toggle"
          @reset-view="zoomView.reset"
          @zoom-in="zoomView.zoomIn"
          @zoom-out="zoomView.zoomOut"
        >
          <template #notices>
            <AvalonWarningBanner v-if="error" title="Could not load the network" :message="error" tone="danger" />
            <AvalonWarningBanner
              v-if="merged?.stoppedAtLimit"
              title="Walk stopped at a limit"
              :message="`Stopped at the ${merged.stoppedAtLimit.maxNodes ? 'node' : 'depth'} limit, so the graph may be incomplete.`"
            />
          </template>
          <template v-if="layout" #legend><GraphLegend /></template>
          <template #scale><ScaleBar :px="bar.px" :ms="bar.ms" /></template>
        </CanvasOverlay>
      </div>
    </div>

    <DetailDrawer
      :open="drawer.isOpen()"
      :title="drawer.shown.value?.title ?? ''"
      :rows="drawer.shown.value ? [...drawer.shown.value.rows, ...extras.detailExtra.value] : []"
      :alerts="nodeAlerts"
      :reduced="extras.motion.reduced.value"
      :can-first="selected !== undefined && selected !== probe.to.value"
      :can-second="selected !== undefined && selected !== probe.from.value"
      @close="drawer.close"
      @trace="traceHere"
      @probe-first="probeFirst"
      @probe-second="probeSecond"
    />
  </AppShell>
</template>
