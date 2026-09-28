<script setup lang="ts">
import { AvalonButton } from '@avalon-initiative/common-ui'
import styles from '../styles/ViewerRttPanel.module.scss'
import { formatLoss, formatMs } from '../utils/formatRtt'
import type { RttRanking, RttSummary } from '../utils/rttStats'

defineProps<{ summaries: RttSummary[]; ranking: RttRanking; running: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <section :class="styles.panel" data-testid="viewer-rtt">
    <div :class="styles.header">
      <h3 :class="styles.title">Round trip from this browser (viewer-observed)</h3>
      <AvalonButton :label="running ? 'Stop measuring' : 'Measure from this browser'" variant="secondary" @click="$emit('toggle')" />
    </div>
    <p :class="styles.note">
      Viewer-observed: each value is this browser's own timing of a public request to the node, so it includes TLS and browser overhead.
    </p>
    <table v-if="summaries.length" :class="styles.table">
      <thead>
        <tr>
          <th scope="col">Node</th>
          <th scope="col">Min</th>
          <th scope="col">Smoothed</th>
          <th scope="col">Loss</th>
          <th scope="col"><span :class="styles.hidden">Rank</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in summaries" :key="s.url" data-testid="rtt-row">
          <td :class="styles.url">{{ s.url }}</td>
          <td :class="styles.value">{{ formatMs(s.minMs) }}</td>
          <td :class="styles.value">{{ formatMs(s.smoothedMs) }}</td>
          <td :class="[styles.value, s.lossRatio > 0 && styles.loss]">{{ formatLoss(s.lossRatio) }}</td>
          <td :class="styles.rank">
            <span v-if="s.url === ranking.fastest" :class="styles.fastest">fastest</span>
            <span v-else-if="s.url === ranking.slowest" :class="styles.slowest">slowest</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
