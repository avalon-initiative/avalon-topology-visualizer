<script setup lang="ts">
import { AvalonButton, AvalonTextField, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import styles from '../styles/TracePanel.module.scss'
import { formatMs } from '../utils/formatRtt'
import { SELF_REPORTED_NOTE } from '../utils/traceSummary'
import type { TraceSummary } from '../utils/traceSummary'
import type { Playback, SpeedName } from '../utils/traceAnimation'

defineProps<{
  entry: string
  entryPlaceholder: string
  target: string | undefined
  loading: boolean
  error: string | null
  summary: TraceSummary | null
  playback: Playback
}>()
defineEmits<{ 'update:entry': [value: string]; trace: []; replay: []; pause: []; speed: [speed: SpeedName] }>()
</script>

<template>
  <section :class="styles.panel" data-testid="trace-panel">
    <h3 :class="styles.title">Packet path trace</h3>
    <p :class="styles.note" data-testid="self-reported">{{ SELF_REPORTED_NOTE }}</p>
    <AvalonTextField
      :model-value="entry"
      label="Entry node URL (empty uses the seed)"
      :placeholder="entryPlaceholder"
      @update:model-value="$emit('update:entry', $event)"
    />
    <p :class="styles.target" data-testid="trace-target">
      Target: {{ target ?? 'none, click a node on the map to pick one' }}
    </p>
    <div :class="styles.actions">
      <AvalonButton :label="loading ? 'Tracing...' : 'Trace to selected node'" @click="$emit('trace')" />
      <template v-if="summary">
        <AvalonButton label="Replay" variant="secondary" @click="$emit('replay')" />
        <AvalonButton
          v-if="playback.status === 'playing' || playback.status === 'paused'"
          :label="playback.status === 'playing' ? 'Pause' : 'Resume'"
          variant="secondary"
          @click="$emit('pause')"
        />
        <AvalonButton
          :label="playback.speed === 'slow' ? 'Normal speed' : 'Slow motion'"
          variant="secondary"
          @click="$emit('speed', playback.speed === 'slow' ? 'normal' : 'slow')"
        />
      </template>
    </div>
    <AvalonWarningBanner v-if="error" title="Trace failed" :message="error" tone="danger" />
    <template v-if="summary">
      <p v-if="summary.outcome.ok" :class="styles.ok" role="status" data-testid="trace-outcome">
        {{ summary.outcome.title }}. {{ summary.outcome.message }}
      </p>
      <AvalonWarningBanner v-else :title="summary.outcome.title" :message="summary.outcome.message" tone="danger" data-testid="trace-outcome" />
      <dl :class="styles.stats" data-testid="trace-summary">
        <dt>Hops</dt>
        <dd data-testid="trace-hops">{{ summary.hopCount }}</dd>
        <dt>Total time (reported)</dt>
        <dd data-testid="trace-total">{{ formatMs(summary.totalMs) }}</dd>
        <dt>Slowest hop</dt>
        <dd data-testid="trace-slowest">
          {{ summary.slowest ? `${summary.slowest.url} (${formatMs(summary.slowest.costMs)})` : '—' }}
        </dd>
      </dl>
      <table v-if="summary.rows.length" :class="styles.table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Node</th>
            <th scope="col">Processing</th>
            <th scope="col">To next</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in summary.rows" :key="r.index" data-testid="trace-row">
            <td>{{ r.index + 1 }}</td>
            <td :class="styles.url">{{ r.url }}</td>
            <td :class="styles.value">{{ formatMs(r.processingMs) }}</td>
            <td :class="styles.value">{{ formatMs(r.toNextMs) }}</td>
          </tr>
        </tbody>
      </table>
      <p :class="styles.note">
        Playback is paced by these reported times, stretched so a few milliseconds are visible. Each leg to the next hop is
        a round trip, so it is split evenly between the way out and the way back. The viewer's own legs have no reported
        time and are drawn at a fixed length.
      </p>
    </template>
  </section>
</template>
