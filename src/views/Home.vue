<script setup lang="ts">
import { AvalonButton, AvalonCard, AvalonTextField, AvalonWarningBanner } from '@avalon-initiative/common-ui'
import styles from '../styles/Home.module.scss'
import { useSeedWalk } from '../composables/useSeedWalk'

const { seedUrl, running, error, summary, run } = useSeedWalk(import.meta.env.VITE_AVALON_SEED_URL ?? '')
</script>

<template>
  <main :class="styles.page">
    <AvalonCard title="Avalon topology visualizer" subtitle="Walk the network from a seed node.">
      <form :class="styles.form" @submit.prevent="run">
        <AvalonTextField v-model="seedUrl" label="Seed node URL" placeholder="http://192.168.7.113:8080" />
        <AvalonButton :label="running ? 'Walking…' : 'Walk network'" :disabled="running" @click="run" />
      </form>
      <AvalonWarningBanner v-if="error" title="Walk failed" :message="error" tone="danger" />
      <dl v-if="summary" :class="styles.summary" data-testid="summary">
        <dt>Nodes visited</dt>
        <dd>{{ summary.visited }}</dd>
        <dt>Unreachable</dt>
        <dd>{{ summary.unreachable }}</dd>
        <dt>Links (active / mirror / known)</dt>
        <dd>{{ summary.active }} / {{ summary.mirror }} / {{ summary.known }}</dd>
      </dl>
    </AvalonCard>
  </main>
</template>
