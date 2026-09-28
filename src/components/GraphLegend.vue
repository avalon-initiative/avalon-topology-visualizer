<script setup lang="ts">
import { glyphGeometry, legendGroups } from '../utils/legend'
import type { NodeGlyph } from '../utils/legend'
import styles from '../styles/GraphLegend.module.scss'

const groups = legendGroups()
const geometry = (glyph: NodeGlyph) => glyphGeometry(glyph)
</script>

<template>
  <section :class="styles.legend" aria-label="Legend">
    <div v-for="group in groups" :key="group.title" :class="styles.group">
      <h3 :class="styles.title">{{ group.title }}</h3>
      <ul :class="styles.items">
        <li v-for="item in group.items" :key="item.id" :class="styles.item">
          <svg v-if="item.glyph.type === 'link'" :class="styles.glyph" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true">
            <line v-if="item.glyph.kind === 'active'" x1="2" y1="8" x2="38" y2="8" :class="styles.active" />
            <line v-else-if="item.glyph.kind === 'known'" x1="2" y1="8" x2="38" y2="8" :class="styles.known" />
            <template v-else>
              <line x1="2" y1="8" x2="38" y2="8" :class="styles.mirror" />
              <polygon points="26,8 17,4 17,12" :class="styles.arrow" />
            </template>
          </svg>
          <svg v-else :class="styles.glyph" viewBox="-16 -16 32 32" width="32" height="32" aria-hidden="true">
            <g :class="item.glyph.dimmed ? styles.dimmed : ''">
              <polygon v-if="geometry(item.glyph).points" :points="geometry(item.glyph).points ?? ''" :class="item.glyph.hollow ? styles.hollow : styles.solid" />
              <circle v-else cx="0" cy="0" r="7" :class="item.glyph.hollow ? styles.hollow : styles.solid" />
              <circle v-if="geometry(item.glyph).ring" cx="0" cy="0" r="10" :class="[styles.ring, styles[`ring-${geometry(item.glyph).ring}`]]" />
            </g>
            <path v-if="geometry(item.glyph).lagArc" :d="geometry(item.glyph).lagArc ?? ''" :class="styles.lag" />
            <circle v-if="item.glyph.pinned" cx="0" cy="0" r="14" :class="styles.pin" />
          </svg>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
