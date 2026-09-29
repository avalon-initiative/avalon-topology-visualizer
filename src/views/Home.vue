<script setup lang="ts">
import { AvalonButton, AvalonCard, AvalonTextField, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import GraphLegend from '../components/GraphLegend.vue'
import NodeDetailPanel from '../components/NodeDetailPanel.vue'
import NodeIssueList from '../components/NodeIssueList.vue'
import ScaleBar from '../components/ScaleBar.vue'
import TimelinePanel from '../components/TimelinePanel.vue'
import TracePanel from '../components/TracePanel.vue'
import TopologyCanvas from '../components/TopologyCanvas.vue'
import ProbePanel from '../components/ProbePanel.vue'
import ViewerRttPanel from '../components/ViewerRttPanel.vue'
import styles from '../styles/Home.module.scss'
import { useCrawler } from '../composables/useCrawler'
import { useCrawlerForm } from '../composables/useCrawlerForm'
import { useGraphStyle } from '../composables/useGraphStyle'
import { useProbe } from '../composables/useProbe'
import { useTimelapse } from '../composables/useTimelapse'
import { useTweenedPositions } from '../composables/useTweenedPositions'
import { useTrace } from '../composables/useTrace'
import { useViewerRtt } from '../composables/useViewerRtt'
import { CANVAS_HEIGHT, CANVAS_WIDTH, useLayout } from '../composables/useLayout'
import { computed } from 'vue'
import { describeFailure } from '../utils/describeFailure'

const crawler = useCrawler()
const { phase, progress, error, takenAt, isLive } = crawler
const timelapse = useTimelapse(crawler)
// The graph on screen: the live crawl, or the snapshot being replayed.
const merged = timelapse.shown
const viewerRtt = useViewerRtt(merged)
const probe = useProbe(merged, () => selected.value)
const extraLayoutLinks = computed(() => [...viewerRtt.links.value, ...probe.links.value])
const extraDrawLinks = computed(() => [...viewerRtt.drawLinks.value, ...probe.drawLinks.value])
const { layout, pinned, bar, pin, unpin } = useLayout(merged, extraLayoutLinks)
const { selected, nodeStyles, links: linkStyles, detail } = useGraphStyle(merged, extraDrawLinks)
const animated = useTweenedPositions(computed(() => layout.value?.positions), timelapse.replaying, CANVAS_WIDTH, CANVAS_HEIGHT)
const { seedUrl, refreshSeconds, walk, onFile, save } = useCrawlerForm(crawler, import.meta.env.VITE_AVALON_SEED_URL ?? '')
const tracer = useTrace({ target: selected, defaultEntry: () => seedUrl.value })
</script>

<template>
  <main :class="styles.page">
    <AvalonCard title="Avalon topology visualizer" subtitle="Walk the network from a seed node, or open a saved snapshot.">
      <form :class="styles.form" @submit.prevent="walk">
        <AvalonTextField v-model="seedUrl" label="Seed node URL" placeholder="http://192.168.7.113:8080" />
        <AvalonTextField v-model="refreshSeconds" label="Refresh every (seconds, 0 = walk once)" />
        <div :class="styles.actions">
          <AvalonButton v-if="phase !== 'walking'" label="Walk network" @click="walk" />
          <AvalonButton v-else label="Stop" variant="secondary" @click="crawler.stop" />
          <AvalonButton v-if="merged" label="Save snapshot" variant="secondary" @click="save" />
          <label :class="styles.file">
            Open snapshot
            <input type="file" accept="application/json,.json" :class="styles.fileInput" @change="onFile" />
          </label>
        </div>
      </form>

      <p v-if="phase === 'walking'" :class="styles.progress" role="status">
        Walking: {{ progress.visited }} of {{ progress.discovered }} nodes visited
      </p>
      <AvalonWarningBanner v-if="error" title="Could not load the network" :message="error" tone="danger" />
      <AvalonWarningBanner
        v-if="merged?.stoppedAtLimit"
        title="Walk stopped at a limit"
        :message="`Stopped at the ${merged.stoppedAtLimit.maxNodes ? 'node' : 'depth'} limit, so the graph may be incomplete.`"
      />

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

      <template v-if="merged">
        <p v-if="!timelapse.replaying.value" :class="styles.source">
          {{ isLive ? 'Live walk' : 'Snapshot' }} from {{ takenAt?.toLocaleString() }}
        </p>
        <dl :class="styles.summary" data-testid="summary">
          <dt>Nodes visited</dt>
          <dd>{{ merged.visited }}</dd>
          <dt>Not reached</dt>
          <dd>{{ merged.unreachable.length + merged.rateLimited.length + merged.unvisited }}</dd>
          <dt>Links</dt>
          <dd>{{ merged.links.length }}</dd>
          <dt>Links the two ends disagree on</dt>
          <dd>{{ merged.disagreements }}</dd>
          <dt>Separate groups</dt>
          <dd>{{ merged.components.length }}</dd>
        </dl>
        <TopologyCanvas
          v-if="layout"
          :positions="animated.positions.value"
          :links="[...merged.links, ...viewerRtt.drawLinks.value]"
          :link-styles="linkStyles"
          :node-styles="nodeStyles"
          :pinned="pinned"
          :selected="selected"
          :view="animated.view.value"
          :trace="tracer.drawing.value"
          :width="CANVAS_WIDTH"
          :height="CANVAS_HEIGHT"
          @pin="pin"
          @unpin="unpin"
          @select="selected = $event"
        />
        <ScaleBar :px="bar.px" :ms="bar.ms" />
        <ViewerRttPanel :summaries="viewerRtt.summaries.value" :ranking="viewerRtt.ranking.value" :running="viewerRtt.running.value" @toggle="viewerRtt.toggle" />
        <TracePanel
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
        <NodeDetailPanel v-if="detail" :title="detail.title" :rows="detail.rows" />
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
        <GraphLegend v-if="layout" />
        <NodeIssueList
          title="Rate limited"
          tone="warning"
          :items="merged.rateLimited.map((n) => ({ url: n.url, reason: describeFailure(n.failure), detail: n.failure.message }))"
        />
        <NodeIssueList
          title="Unreachable"
          tone="danger"
          :items="merged.unreachable.map((n) => ({ url: n.url, reason: describeFailure(n.failure), detail: n.failure.message }))"
        />
      </template>
    </AvalonCard>
  </main>
</template>
