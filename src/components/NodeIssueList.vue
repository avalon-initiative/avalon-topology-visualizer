<script setup lang="ts">
import styles from '../styles/NodeIssueList.module.scss'

defineProps<{
  title: string
  tone: 'warning' | 'danger'
  items: { url: string; reason: string; detail: string }[]
}>()
</script>

<template>
  <section v-if="items.length" :class="styles.list">
    <h3 :class="styles.title">{{ title }} ({{ items.length }})</h3>
    <ul :class="styles.items">
      <li v-for="item in items" :key="item.url" :class="styles.item">
        <span :class="styles.url">{{ item.url }}</span>
        <span :class="[styles.reason, styles[tone]]" :title="item.detail">{{ item.reason }}</span>
      </li>
    </ul>
  </section>
</template>
