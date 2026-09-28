import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { normalizeNodeUrl } from '@avalon-initiative/protocol-sdk'
import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'
import { liveWalkSource, snapshotSource } from '../api/graphSource'
import type { GraphSource, WalkLimits, WalkProgress } from '../api/graphSource'
import { mergeGraph } from '../utils/mergeGraph'
import { createSnapshot, parseSnapshot, serializeSnapshot } from '../utils/snapshot'

export type CrawlerPhase = 'idle' | 'walking' | 'ready' | 'stopped' | 'failed'

export function useCrawler() {
  const phase = ref<CrawlerPhase>('idle')
  const graph = shallowRef<TopologyGraph | null>(null)
  const progress = ref<WalkProgress>({ discovered: 0, visited: 0 })
  const error = ref('')
  const takenAt = ref<Date | null>(null)
  const isLive = ref(false)
  const merged = computed(() => (graph.value ? mergeGraph(graph.value) : null))

  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let run = 0

  function cancelPending() {
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = null
  }

  async function pass(source: GraphSource, refreshMs: number) {
    const mine = ++run
    const own = new AbortController()
    controller = own
    isLive.value = source.live
    phase.value = 'walking'
    error.value = ''
    progress.value = { discovered: 0, visited: 0 }
    try {
      const result = await source.load(own.signal, (p) => {
        if (mine === run) progress.value = p
      })
      if (mine !== run) return
      // A stopped walk keeps the last complete graph and only falls back to its own partial one.
      if (!result.cancelled || graph.value === null) {
        graph.value = result
        takenAt.value = source.takenAt ?? new Date()
      }
      phase.value = result.cancelled ? 'stopped' : 'ready'
      if (source.live && !result.cancelled && refreshMs > 0) timer = setTimeout(() => pass(source, refreshMs), refreshMs)
    } catch (e) {
      if (mine !== run) return
      error.value = e instanceof Error ? e.message : String(e)
      phase.value = 'failed'
    }
  }

  /** Walks from `rawSeed` now, then again every `refreshMs` (0 = once). */
  function start(rawSeed: string, limits: WalkLimits = {}, refreshMs = 0) {
    const seed = normalizeNodeUrl(rawSeed)
    if (!seed) {
      error.value = 'Enter an http(s) URL for a seed node.'
      phase.value = 'failed'
      return
    }
    cancelPending()
    return pass(liveWalkSource([seed], limits), refreshMs)
  }

  function stop() {
    cancelPending()
    run++
    if (phase.value === 'walking') phase.value = graph.value ? 'stopped' : 'idle'
  }

  function loadSnapshot(text: string) {
    cancelPending()
    try {
      return pass(snapshotSource(parseSnapshot(text)), 0)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      phase.value = 'failed'
    }
  }

  function saveSnapshot(): string | null {
    return graph.value ? serializeSnapshot(createSnapshot(graph.value, takenAt.value ?? new Date())) : null
  }

  onScopeDispose(stop)

  return { phase, graph, merged, progress, error, takenAt, isLive, start, stop, loadSnapshot, saveSnapshot }
}
