<script setup lang="ts">
import type { DetailRow } from '../utils/nodeDetail'
import styles from '../styles/NodeDetailPanel.module.scss'

defineProps<{ title: string; rows: DetailRow[] }>()
</script>

<template>
  <section :class="styles.panel" aria-label="Selected node">
    <h3 :class="styles.title">{{ title }}</h3>
    <dl :class="styles.list">
      <div v-for="row in rows" :key="row.label" :class="[styles.row, row.block ? styles.blockRow : '']">
        <dt :class="styles.label">{{ row.label }}</dt>
        <dd :class="[styles.value, row.mono ? styles.mono : '', row.block ? styles.block : '']">{{ row.value }}</dd>
      </div>
    </dl>
  </section>
</template>
