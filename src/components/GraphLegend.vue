<script setup lang="ts">
import { computed } from 'vue'
import { AvalonLegend } from '@avalon-initiative/common-ui'
import type { ShardKeyItem } from '../utils/shardGroups'
import { glyphGeometry, glyphsById, legendGroups, uiLegendGroups } from '../utils/legend'
import styles from '../styles/GraphLegend.module.scss'

const props = defineProps<{ shards?: ShardKeyItem[] }>()
const legend = computed(() => legendGroups(props.shards))
const groups = computed(() => uiLegendGroups(legend.value))
const glyphs = computed(() => glyphsById(legend.value))
</script>

<template>
  <AvalonLegend :groups="groups" label="Legend">
    <template #glyph="{ item }">
      <template v-for="glyph in [glyphs[item.id ?? '']]" :key="glyph.type">
        <svg v-if="glyph.type === 'link'" :class="styles.glyph" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true">
          <line v-if="glyph.kind === 'active'" x1="2" y1="8" x2="38" y2="8" :class="styles.active" />
          <line v-else-if="glyph.kind === 'known'" x1="2" y1="8" x2="38" y2="8" :class="styles.known" />
          <template v-else>
            <line x1="2" y1="8" x2="38" y2="8" :class="styles.mirror" />
            <polygon points="26,8 17,4 17,12" :class="styles.arrow" />
          </template>
        </svg>
        <svg v-else-if="glyph.type === 'pulse'" :class="styles.glyph" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true">
          <line x1="2" y1="8" x2="38" y2="8" :class="styles.active" />
          <circle cx="20" cy="8" r="3.5" :class="styles.pulse" />
        </svg>
        <svg v-else-if="glyph.type === 'shard'" :class="styles.glyph" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true">
          <rect x="2" y="1" width="36" height="14" rx="7" fill="none" :class="[styles.shard, styles[`shard-${glyph.color}`]]" />
        </svg>
        <svg v-else :class="styles.glyph" viewBox="-16 -16 32 32" width="32" height="32" aria-hidden="true">
          <g :class="glyph.dimmed ? styles.dimmed : ''">
            <polygon v-if="glyphGeometry(glyph).points" :points="glyphGeometry(glyph).points ?? ''" :class="glyph.hollow ? styles.hollow : styles.solid" />
            <circle v-else cx="0" cy="0" r="7" :class="glyph.hollow ? styles.hollow : styles.solid" />
            <circle v-if="glyphGeometry(glyph).ring" cx="0" cy="0" r="10" :class="[styles.ring, styles[`ring-${glyphGeometry(glyph).ring}`]]" />
          </g>
          <path v-if="glyphGeometry(glyph).lagArc" :d="glyphGeometry(glyph).lagArc ?? ''" :class="styles.lag" />
          <circle v-if="glyph.pinned" cx="0" cy="0" r="14" :class="styles.pin" />
          <template v-if="glyph.alert">
            <circle cx="9" cy="-9" r="6" :class="glyph.alert === 'equivocation' ? styles.badgeDanger : styles.badgeWarning" />
            <text x="9" y="-9" text-anchor="middle" dominant-baseline="central" :class="styles.badgeText">{{ glyph.alert === 'equivocation' ? '!' : 'S' }}</text>
          </template>
        </svg>
      </template>
    </template>
  </AvalonLegend>
</template>
