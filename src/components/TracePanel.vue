<script setup lang="ts">
import { AvalonButton, AvalonTextField, AvalonToggleSwitch, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import styles from '../styles/TracePanel.module.scss'
import { nodeLabel } from '../utils/drawGraph'
import { formatMs } from '../utils/formatRtt'
import { SELF_REPORTED_NOTE } from '../utils/traceSummary'
import type { TraceSummary } from '../utils/traceSummary'
import type { Playback, SpeedName } from '../utils/traceAnimation'

defineProps<{
  entry: string
  entryPlaceholder: string
  target: string | undefined
  /** Nodes the route passes through, in order, between the entry and the target. */
  via: string[]
  returnTrip: boolean
  /** The node selected on the map, offered as the entry or the target. */
  selected?: string
  /** Index of the hop the packet is at, for the highlighted row; null when none. */
  activeHop?: number | null
  loading: boolean
  error: string | null
  summary: TraceSummary | null
  playback: Playback
}>()
defineEmits<{
  'update:entry': [value: string]
  pickEntry: []
  pickTarget: []
  swap: []
  addVia: []
  removeVia: [index: number]
  'update:returnTrip': [value: boolean]
  trace: []
  clear: []
  replay: []
  pause: []
  speed: [speed: SpeedName]
}>()
</script>

<template>
  <section :class="styles.panel" data-testid="trace-panel">
    <h3 :class="styles.title">Packet path trace</h3>
    <p :class="styles.note" data-testid="self-reported">{{ SELF_REPORTED_NOTE }}</p>
    <AvalonTextField
      :model-value="entry"
      label="From (entry node URL, empty uses the seed)"
      :placeholder="entryPlaceholder"
      @update:model-value="$emit('update:entry', $event)"
    />
    <dl :class="styles.ends">
      <dt>To</dt>
      <dd data-testid="trace-target">{{ target ?? 'none, click a node on the map to pick one' }}</dd>
    </dl>
    <ol v-if="via.length" :class="styles.via" aria-label="Stops between the entry and the target">
      <li v-for="(u, i) in via" :key="`${i}-${u}`" data-testid="trace-via">
        <span :class="styles.url" :title="u">{{ i + 1 }}. {{ nodeLabel(u) }}</span>
        <AvalonButton :label="`Remove stop ${i + 1}`" variant="secondary" @click="$emit('removeVia', i)" />
      </li>
    </ol>
    <AvalonToggleSwitch :model-value="returnTrip" label="Return to the entry node afterwards" description="Adds a leg from the target back to the entry." @update:model-value="$emit('update:returnTrip', $event)" />
    <div :class="styles.actions">
      <AvalonButton label="Use selected as entry" variant="secondary" :disabled="!selected" @click="$emit('pickEntry')" />
      <AvalonButton label="Use selected as target" variant="secondary" :disabled="!selected" @click="$emit('pickTarget')" />
      <AvalonButton label="Add selected as a stop" variant="secondary" :disabled="!selected" @click="$emit('addVia')" />
      <AvalonButton label="Swap" variant="secondary" :disabled="!target" @click="$emit('swap')" />
    </div>
    <div :class="styles.actions">
      <AvalonButton :label="loading ? 'Tracing...' : 'Trace'" :disabled="loading" @click="$emit('trace')" />
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
        <AvalonButton label="Clear" variant="secondary" @click="$emit('clear')" />
      </template>
    </div>
    <AvalonWarningBanner v-if="error" title="Trace failed" :message="error" tone="danger" />
    <template v-if="summary">
      <p v-if="summary.outcome.ok" :class="styles.ok" role="status" data-testid="trace-outcome">
        {{ summary.outcome.title }}. {{ summary.outcome.message }}
      </p>
      <AvalonWarningBanner v-else :title="summary.outcome.title" :message="summary.outcome.message" tone="danger" data-testid="trace-outcome" />
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
          <tr v-for="r in summary.rows" :key="r.index" :class="{ [styles.active]: r.index === activeHop }" :aria-current="r.index === activeHop ? 'step' : undefined" data-testid="trace-row">
            <td>{{ r.index + 1 }}</td>
            <td :class="styles.url" :title="r.url">{{ nodeLabel(r.url) }}</td>
            <td :class="styles.value">{{ formatMs(r.processingMs) }}</td>
            <td :class="styles.value">{{ formatMs(r.toNextMs) }}</td>
          </tr>
        </tbody>
      </table>
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
      <p :class="styles.note">
        Playback keeps the proportions of these reported times but is stretched so the whole path takes a few seconds to
        watch. On the map, each numbered badge is a hop, with its processing and forward time. Each leg to the next hop is
        a round trip, so it is split evenly between the way out and the way back. The viewer's own legs have no reported
        time and are drawn at a fixed length.
      </p>
    </template>
  </section>
</template>
