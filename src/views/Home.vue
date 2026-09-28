<script setup lang="ts">
import { AvalonButton, AvalonCard, AvalonTextField, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import GraphLegend from '../components/GraphLegend.vue'
import NodeDetailPanel from '../components/NodeDetailPanel.vue'
import NodeIssueList from '../components/NodeIssueList.vue'
import ScaleBar from '../components/ScaleBar.vue'
import TopologyCanvas from '../components/TopologyCanvas.vue'
import styles from '../styles/Home.module.scss'
import { useCrawler } from '../composables/useCrawler'
import { useCrawlerForm } from '../composables/useCrawlerForm'
import { useGraphStyle } from '../composables/useGraphStyle'
import { CANVAS_HEIGHT, CANVAS_WIDTH, useLayout } from '../composables/useLayout'
import { describeFailure } from '../utils/describeFailure'

const crawler = useCrawler()
const { phase, merged, progress, error, takenAt, isLive } = crawler
const { layout, pinned, view, bar, pin, unpin } = useLayout(merged)
const { selected, nodeStyles, links: linkStyles, detail } = useGraphStyle(merged)
const { seedUrl, refreshSeconds, walk, onFile, save } = useCrawlerForm(crawler, import.meta.env.VITE_AVALON_SEED_URL ?? '')
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

      <template v-if="merged">
        <p :class="styles.source">
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
          :positions="layout.positions"
          :links="merged.links"
          :link-styles="linkStyles"
          :node-styles="nodeStyles"
          :pinned="pinned"
          :selected="selected"
          :view="view"
          :width="CANVAS_WIDTH"
          :height="CANVAS_HEIGHT"
          @pin="pin"
          @unpin="unpin"
          @select="selected = $event"
        />
        <ScaleBar :px="bar.px" :ms="bar.ms" />
        <NodeDetailPanel v-if="detail" :title="detail.title" :rows="detail.rows" />
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
