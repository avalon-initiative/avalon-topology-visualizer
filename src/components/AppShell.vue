<script setup lang="ts">
import styles from '../styles/AppShell.module.scss'

defineProps<{ sidebarOpen: boolean; drawerOpen?: boolean }>()
</script>

<template>
  <div :class="styles.shell">
    <header :class="styles.header">
      <slot name="topbar" />
    </header>
    <div :class="styles.body">
      <aside v-show="sidebarOpen" id="tool-sidebar" :class="[styles.sidebar, drawerOpen && styles.yields]" aria-label="Tools">
        <slot name="sidebar" />
      </aside>
      <main :class="styles.main">
        <slot />
      </main>
    </div>
  </div>
</template>
