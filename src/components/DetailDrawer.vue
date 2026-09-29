<script setup lang="ts">
import { AvalonButton } from '@avalon-initiative/common-ui'
import { ref } from 'vue'
import AlertList from './AlertList.vue'
import NodeDetailPanel from './NodeDetailPanel.vue'
import styles from '../styles/DetailDrawer.module.scss'
import { useFocusOnOpen } from '../composables/useFocusOnOpen'
import type { Alert } from '../utils/alerts'
import type { DetailRow } from '../utils/nodeDetail'

const props = defineProps<{
  open: boolean
  title: string
  rows: DetailRow[]
  alerts: Alert[]
  /** True when motion is reduced (OS or the app's setting): the drawer then appears and disappears without sliding. */
  reduced: boolean
  canFirst: boolean
  canSecond: boolean
}>()
defineEmits<{ close: []; trace: []; probeFirst: []; probeSecond: [] }>()

const panel = ref<HTMLElement | null>(null)
useFocusOnOpen(() => props.open, panel)
</script>

<template>
  <Transition :css="!reduced" :enter-from-class="styles.away" :leave-to-class="styles.away" :enter-active-class="styles.sliding" :leave-active-class="styles.sliding">
    <aside v-if="open" ref="panel" :class="styles.drawer" role="complementary" aria-label="Node details" tabindex="-1" data-testid="detail-drawer">
      <header :class="styles.header">
        <h2 :class="styles.heading">Node details</h2>
        <AvalonButton label="Close" variant="secondary" aria-label="Close node details" @click="$emit('close')" />
      </header>
      <div :class="styles.actions" role="group" aria-label="Quick actions">
        <AvalonButton label="Trace to this node" @click="$emit('trace')" />
        <AvalonButton label="Use as probe first" variant="secondary" :disabled="!canFirst" @click="$emit('probeFirst')" />
        <AvalonButton label="Use as probe second" variant="secondary" :disabled="!canSecond" @click="$emit('probeSecond')" />
      </div>
      <NodeDetailPanel :title="title" :rows="rows" />
      <AlertList v-if="alerts.length" :alerts="alerts" />
    </aside>
  </Transition>
</template>
