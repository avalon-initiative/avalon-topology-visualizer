<script setup lang="ts">
import { AvalonButton, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import styles from '../styles/ProbePanel.module.scss'
import { nodeLabel } from '../utils/drawGraph'
import { describeProbeSuccess } from '../utils/probeOutcome'
import type { ProbeOutcome, ProbeSuccess } from '../utils/probeOutcome'

defineProps<{
  from?: string
  to?: string
  /** The node currently selected in the graph, offered as the next pick. */
  selected?: string
  busy: boolean
  canProbe: boolean
  canRandom: boolean
  /** Seconds until the first node accepts another probe; 0 when it does now. */
  cooldown: number
  message: string
  last: ProbeOutcome | null
  probes: ProbeSuccess[]
}>()
defineEmits<{ pickFirst: []; pickSecond: []; measure: []; random: [] }>()
</script>

<template>
  <section :class="styles.panel" data-testid="probe-panel" aria-label="Probe two nodes">
    <h3 :class="styles.title">Distance between two nodes (measured by the first)</h3>
    <p :class="styles.note">
      Select a node in the graph, use it as the first or the second, then ask the first to measure its round trip to the second.
      The value is the first node's own measurement, not this browser's.
    </p>
    <dl :class="styles.ends">
      <dt>First (measures)</dt>
      <dd data-testid="probe-from">{{ from ? nodeLabel(from) : 'not chosen' }}</dd>
      <dt>Second (target)</dt>
      <dd data-testid="probe-to">{{ to ? nodeLabel(to) : 'not chosen' }}</dd>
    </dl>
    <div :class="styles.actions">
      <AvalonButton label="Use selected as first" variant="secondary" :disabled="!selected || selected === to" @click="$emit('pickFirst')" />
      <AvalonButton label="Use selected as second" variant="secondary" :disabled="!selected || selected === from" @click="$emit('pickSecond')" />
      <AvalonButton :label="busy ? 'Measuring...' : 'Measure distance'" :disabled="!canProbe" @click="$emit('measure')" />
      <AvalonButton label="Probe a random neighbor pair" variant="secondary" :disabled="!canRandom" @click="$emit('random')" />
    </div>
    <p v-if="cooldown > 0" :class="styles.cooldown" role="status" data-testid="probe-cooldown">
      Rate limited: the first node accepts another probe in {{ cooldown }} s.
    </p>
    <AvalonWarningBanner v-if="message" title="Probe failed" :message="message" tone="warning" />
    <p v-if="last?.ok" :class="styles.result" role="status" data-testid="probe-result">{{ describeProbeSuccess(last) }}</p>
    <ul v-if="probes.length" :class="styles.list" aria-label="Measured pairs">
      <li v-for="p in probes" :key="`${p.from}|${p.to}`" data-testid="probe-row">{{ describeProbeSuccess(p) }}</li>
    </ul>
  </section>
</template>
