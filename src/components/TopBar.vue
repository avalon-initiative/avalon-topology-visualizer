<script setup lang="ts">
import { AvalonButton, AvalonTextField, AvalonToggleSwitch } from '@avalon-initiative/common-ui'
import styles from '../styles/TopBar.module.scss'
import type { NetworkOption } from '../api/networks'
import type { SummaryStat } from '../utils/summaryStats'

defineProps<{
  walking: boolean
  networks: NetworkOption[]
  selectedNetwork: string
  hasGraph: boolean
  toolsOpen: boolean
  /** Narrow screens only: whether the walk form is unfolded. Wide screens always show it. */
  controlsOpen: boolean
  /** Progress or source line, e.g. "Live walk from ...". */
  status: string
  stats: SummaryStat[]
  /** True when motion is reduced (OS or the app's setting). */
  reducedMotion: boolean
}>()
const seedUrl = defineModel<string>('seedUrl', { required: true })
const refreshSeconds = defineModel<string>('refreshSeconds', { required: true })
defineEmits<{ network: [networkId: string]; walk: []; stop: []; save: []; file: [event: Event]; toggleTools: []; toggleControls: []; toggleMotion: [] }>()
</script>

<template>
  <div :class="styles.bar">
    <div :class="styles.main">
      <div :class="styles.brand">
        <AvalonButton
          :label="toolsOpen ? 'Hide tools' : 'Show tools'"
          variant="secondary"
          aria-controls="tool-sidebar"
          :aria-expanded="toolsOpen"
          @click="$emit('toggleTools')"
        />
        <h1 :class="styles.title">Avalon topology visualizer</h1>
        <div :class="styles.controlsToggle">
          <AvalonButton
            :label="controlsOpen ? 'Hide walk form' : 'Walk form'"
            variant="secondary"
            aria-controls="walk-form"
            :aria-expanded="controlsOpen"
            @click="$emit('toggleControls')"
          />
        </div>
      </div>

      <form id="walk-form" :class="[styles.form, !controlsOpen && styles.folded]" @submit.prevent="$emit('walk')">
        <div v-if="networks.length" :class="styles.networks" role="group" aria-label="Networks">
          <span :class="styles.networksLabel">Network</span>
          <AvalonButton
            v-for="n in networks"
            :key="n.networkId"
            :label="n.networkId"
            :variant="selectedNetwork === n.networkId ? 'primary' : 'secondary'"
            :disabled="walking"
            data-testid="network-button"
            @click="$emit('network', n.networkId)"
          />
        </div>
        <div :class="styles.seed"><AvalonTextField v-model="seedUrl" label="Or a seed node URL" placeholder="http://192.168.7.113:8080" /></div>
        <div :class="styles.refresh"><AvalonTextField v-model="refreshSeconds" label="Refresh (s, 0 = once)" /></div>
        <div :class="styles.actions">
          <AvalonButton v-if="!walking" label="Walk network" @click="$emit('walk')" />
          <AvalonButton v-else label="Stop" variant="secondary" @click="$emit('stop')" />
          <AvalonButton v-if="hasGraph" label="Save snapshot" variant="secondary" @click="$emit('save')" />
          <label :class="styles.file">
            Open snapshot
            <input type="file" accept="application/json,.json" :class="styles.fileInput" @change="$emit('file', $event)" />
          </label>
        </div>
      </form>
    </div>

    <div :class="styles.strip">
      <p v-if="status" :class="styles.status" role="status">{{ status }}</p>
      <dl v-if="stats.length" :class="styles.stats" data-testid="summary">
        <div v-for="stat in stats" :key="stat.label" :class="styles.stat" :title="stat.hint">
          <dt>{{ stat.label }}</dt>
          <dd>{{ stat.value }}</dd>
        </div>
      </dl>
      <div :class="styles.motion">
        <AvalonToggleSwitch
          :model-value="reducedMotion"
          label="Reduce motion"
          compact
          title="Changes show as static markers instead of pulses."
          data-testid="motion-toggle"
          @update:model-value="$emit('toggleMotion')"
        />
      </div>
    </div>
  </div>
</template>
