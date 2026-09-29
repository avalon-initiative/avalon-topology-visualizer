<script setup lang="ts">
import { AvalonButton, AvalonTimelineStrip } from '@avalon-initiative/common-ui'
import { computed } from 'vue'
import styles from '../styles/TimelinePanel.module.scss'
import { timelineItems } from '../utils/timelineItems'
import type { SnapshotDiff } from '../utils/snapshotDiff'
import type { TimelineMarker } from '../composables/useTimelapse'

const props = defineProps<{
  markers: TimelineMarker[]
  /** Replay position, or null while showing the live graph. */
  index: number | null
  playing: boolean
  diff: SnapshotDiff
  error: string
  saved: boolean
}>()
defineEmits<{ seek: [index: number]; step: [by: number]; live: []; play: []; pause: []; export: []; clear: []; importFile: [event: Event] }>()

const when = (iso: string) => new Date(iso).toLocaleString()
const items = computed(() => timelineItems(props.markers))
</script>

<template>
  <section :class="styles.panel" aria-label="Time-lapse" data-testid="timeline">
    <div :class="styles.header">
      <h3 :class="styles.title">Time-lapse</h3>
      <div :class="styles.actions">
        <AvalonButton v-if="!playing" label="Play" variant="secondary" :disabled="markers.length < 2" @click="$emit('play')" />
        <AvalonButton v-else label="Pause" variant="secondary" @click="$emit('pause')" />
        <AvalonButton label="Previous" variant="secondary" :disabled="markers.length === 0 || index === 0" @click="$emit('step', -1)" />
        <AvalonButton label="Next" variant="secondary" :disabled="index === null || index >= markers.length - 1" @click="$emit('step', 1)" />
        <AvalonButton label="Back to live" :disabled="index === null" @click="$emit('live')" />
      </div>
    </div>

    <p :class="[styles.mode, index !== null && styles.replay]" role="status" data-testid="timeline-mode">
      <template v-if="index !== null && markers[index]">
        Replay: snapshot {{ index + 1 }} of {{ markers.length }}, {{ when(markers[index].takenAt) }}. Live crawling continues in the background.
      </template>
      <template v-else>Live{{ markers.length ? `: ${markers.length} snapshot${markers.length === 1 ? '' : 's'} recorded.` : ': snapshots are recorded on each refresh.' }}</template>
    </p>

    <template v-if="markers.length">
      <input
        type="range"
        :class="styles.slider"
        aria-label="Snapshot"
        min="0"
        :max="markers.length - 1"
        :value="index ?? markers.length - 1"
        @input="$emit('seek', Number(($event.target as HTMLInputElement).value))"
      />
      <p :class="styles.key">Each refresh saves a snapshot. Click one to see the network as it was.</p>
      <AvalonTimelineStrip
        :items="items"
        :current="index === null ? undefined : String(index)"
        label="Snapshots"
        data-testid="timeline-ticks"
        @select="$emit('seek', Number($event))"
      />
      <p :class="styles.key">+ joined, - departed, ~ version changed, compared with the snapshot before.</p>
    </template>

    <dl v-if="index !== null && (diff.joined.length || diff.departed.length || diff.versionChanges.length)" :class="styles.detail" data-testid="timeline-diff">
      <template v-if="diff.joined.length">
        <dt>Joined</dt>
        <dd>{{ diff.joined.join(', ') }}</dd>
      </template>
      <template v-if="diff.departed.length">
        <dt>Departed</dt>
        <dd>{{ diff.departed.join(', ') }}</dd>
      </template>
      <template v-if="diff.versionChanges.length">
        <dt>Version changed</dt>
        <dd>{{ diff.versionChanges.map((c) => `${c.url} ${c.from} to ${c.to}`).join(', ') }}</dd>
      </template>
    </dl>

    <p v-if="!saved" :class="styles.note" data-testid="timeline-unsaved">
      History is not fully saved in this browser (storage is unavailable or full); export it to keep it.
    </p>
    <p v-if="error" :class="styles.error" role="alert">{{ error }}</p>

    <div :class="styles.actions">
      <AvalonButton label="Export history" variant="secondary" :disabled="markers.length === 0" @click="$emit('export')" />
      <label :class="styles.file">
        Import history
        <input type="file" accept="application/json,.json" :class="styles.fileInput" @change="$emit('importFile', $event)" />
      </label>
      <AvalonButton label="Clear history" variant="secondary" :disabled="markers.length === 0" @click="$emit('clear')" />
    </div>
  </section>
</template>
