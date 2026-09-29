<script setup lang="ts">
import { AvalonWarningBanner } from '@avalon-initiative/common-ui'
import { computed, ref } from 'vue'
import AlertList from '../components/AlertList.vue'
import AppShell from '../components/AppShell.vue'
import CanvasOverlay from '../components/CanvasOverlay.vue'
import DetailDrawer from '../components/DetailDrawer.vue'
import FilterPanel from '../components/FilterPanel.vue'
import GraphLegend from '../components/GraphLegend.vue'
import MotionToggle from '../components/MotionToggle.vue'
import NodeIssueList from '../components/NodeIssueList.vue'
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
const { layout, pinned, bar, pin, unpin } = useLayout(merged, extraLayoutLinks, size)
const { selected, facts, nodeStyles, links: linkStyles, detail } = useGraphStyle(merged, extraDrawLinks)
const animated = useTweenedPositions(computed(() => layout.value?.positions), timelapse.replaying, () => size.value.width, () => size.value.height)
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
const { seedUrl, refreshSeconds, walk, onFile, save } = useCrawlerForm(crawler, import.meta.env.VITE_AVALON_SEED_URL ?? '')
const tracer = useTrace({ target: selected, defaultEntry: () => seedUrl.value })

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
    filtersOn: extras.filterOn.value,
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
  <AppShell :sidebar-open="workspace.sidebar.open.value">
    <template #topbar>
      <TopBar
        v-model:seed-url="seedUrl"
        v-model:refresh-seconds="refreshSeconds"
        :walking="phase === 'walking'"
        :has-graph="merged !== null"
        :tools-open="workspace.sidebar.open.value"
        :controls-open="workspace.controls.open.value"
        :status="status"
        :stats="stats"
        @walk="walk"
        @stop="crawler.stop"
        @save="save"
        @file="onFile"
        @toggle-tools="workspace.sidebar.toggle"
        @toggle-controls="workspace.controls.toggle"
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
        <template #filters>
          <template v-if="merged">
            <FilterPanel
              :filters="extras.filters.value"
              :options="extras.options.value"
              :mode="extras.filterMode.value"
              :active="extras.filterOn.value"
              :shown="extras.shownCount.value"
              :total="merged.nodes.length"
              @toggle="extras.toggleFilter"
              @search="extras.filters.value = { ...extras.filters.value, search: $event }"
              @mode="extras.filterMode.value = $event"
              @clear="extras.clearFilters"
            />
            <MotionToggle :reduced="extras.motion.reduced.value" @toggle="extras.motion.toggle" />
          </template>
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
            :target="selected"
            :loading="tracer.loading.value"
            :error="tracer.error.value"
            :summary="tracer.summary.value"
            :playback="tracer.playback.value"
            @trace="tracer.trace"
            @replay="tracer.replay"
            @pause="tracer.togglePause"
            @speed="tracer.changeSpeed"
          />
        </template>
        <template #issues>
          <template v-if="merged">
            <AlertList :alerts="extras.alerts.value" @select="selected = $event" />
            <NodeIssueList title="Rate limited" tone="warning" :items="rateLimited" />
            <NodeIssueList title="Unreachable" tone="danger" :items="unreachable" />
            <p v-if="issueCount === 0" :class="styles.note" data-testid="no-issues">No alerts and no unreachable nodes.</p>
          </template>
        </template>
      </ToolSidebar>
    </template>

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
        :view="animated.view.value"
        :trace="tracer.drawing.value"
        :width="size.width"
        :height="size.height"
        @pin="pin"
        @unpin="unpin"
        @select="selected = $event"
      />
      <p v-else :class="styles.empty">Enter a seed node URL and choose Walk network, or open a saved snapshot.</p>

      <CanvasOverlay :legend-open="workspace.legend.open.value" @toggle-legend="workspace.legend.toggle">
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
    </div>
  </AppShell>
</template>
