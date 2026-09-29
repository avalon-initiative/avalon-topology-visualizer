<script setup lang="ts">
import { AvalonButton, AvalonDetailList, AvalonDrawer, AvalonIssueList } from '@avalon-initiative/common-ui'
import { computed } from 'vue'
import { alertIssues } from '../utils/issueItems'
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

const issues = computed(() => alertIssues(props.alerts))
</script>

<template>
  <AvalonDrawer :open="open" title="Node details" close-label="Close node details" :reduced-motion="reduced" data-testid="detail-drawer" @close="$emit('close')">
    <template #actions>
      <AvalonButton label="Trace to this node" @click="$emit('trace')" />
      <AvalonButton label="Use as probe first" variant="secondary" :disabled="!canFirst" @click="$emit('probeFirst')" />
      <AvalonButton label="Use as probe second" variant="secondary" :disabled="!canSecond" @click="$emit('probeSecond')" />
    </template>
    <AvalonDetailList :title="title" :items="rows" label="Selected node" />
    <AvalonIssueList title="Alerts" label="Alerts" :items="issues" data-testid="alerts" />
  </AvalonDrawer>
</template>
