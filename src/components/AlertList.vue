<script setup lang="ts">
import { ALERT_LABELS } from '../utils/alerts'
import type { Alert } from '../utils/alerts'
import styles from '../styles/AlertList.module.scss'

defineProps<{ alerts: Alert[] }>()
defineEmits<{ select: [url: string] }>()
</script>

<template>
  <section v-if="alerts.length" :class="styles.list" aria-label="Alerts" data-testid="alerts">
    <h3 :class="styles.title">Alerts ({{ alerts.length }})</h3>
    <ul :class="styles.items">
      <li v-for="alert in alerts" :key="alert.id" :class="styles.item">
        <span :class="[styles.kind, styles[alert.kind]]">{{ ALERT_LABELS[alert.kind] }}</span>
        <button type="button" :class="styles.url" @click="$emit('select', alert.url)">{{ alert.url }}</button>
        <span :class="styles.detail">{{ alert.title }}. {{ alert.detail }}</span>
      </li>
    </ul>
  </section>
</template>
