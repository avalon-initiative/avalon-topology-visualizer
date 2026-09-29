import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { useCrawler } from './useCrawler'
import { appendSnapshot, browserStorage, clampIndex, clearStoredHistory, HISTORY_CAP, loadHistory, parseHistory, saveHistory, serializeHistory, shiftIndex } from '../utils/history'
import { mergeGraph } from '../utils/mergeGraph'
import { createSnapshot } from '../utils/snapshot'
import { downloadText, readFileText } from '../utils/snapshotFile'
import { diffLabel, diffSeries, EMPTY_DIFF, hasChanges } from '../utils/snapshotDiff'

export const PLAY_STEP_MS = 1200

export interface TimelapseOptions {
  storage?: Storage | null
  cap?: number
  playStepMs?: number
}

export interface TimelineMarker {
  index: number
  takenAt: string
  label: string
  joined: number
  departed: number
  versionChanges: number
}

/**
 * Records each live refresh into a bounded history and replays it. `index` null means live: the crawler's
 * own graph is shown and keeps refreshing. A number means replay: that snapshot is shown, and the crawler
 * carries on recording in the background.
 */
export function useTimelapse(
  crawler: Pick<ReturnType<typeof useCrawler>, 'graph' | 'takenAt' | 'isLive' | 'merged'>,
  options: TimelapseOptions = {},
) {
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const cap = options.cap ?? HISTORY_CAP
  const stepMs = options.playStepMs ?? PLAY_STEP_MS

  const history = shallowRef(loadHistory(storage, cap))
  const index = ref<number | null>(null)
  const playing = ref(false)
  const error = ref('')
  const saved = ref(storage !== null)

  const replaying = computed(() => index.value !== null && index.value < history.value.length)
  const current = computed(() => (replaying.value ? history.value[index.value as number] : null))
  const shown = computed(() => (current.value ? mergeGraph(current.value.graph) : crawler.merged.value))
  const diffs = computed(() => diffSeries(history.value.map((s) => s.graph)))
  const markers = computed<TimelineMarker[]>(() =>
    history.value.map((s, i) => {
      const d = diffs.value[i]
      return { index: i, takenAt: s.takenAt, label: diffLabel(d), joined: d.joined.length, departed: d.departed.length, versionChanges: d.versionChanges.length }
    }),
  )
  const currentDiff = computed(() => (replaying.value ? diffs.value[index.value as number] : EMPTY_DIFF))
  const changeCount = computed(() => diffs.value.filter(hasChanges).length)

  watch(crawler.graph, (g) => {
    if (!g || g.cancelled || !crawler.isLive.value) return
    const next = appendSnapshot(history.value, createSnapshot(g, crawler.takenAt.value ?? new Date()), cap)
    history.value = next.history
    if (index.value !== null) index.value = shiftIndex(index.value, next.dropped)
  })

  watch(history, (h) => {
    saved.value = saveHistory(storage, h)
  })

  let timer: ReturnType<typeof setInterval> | undefined
  function pause() {
    clearInterval(timer)
    timer = undefined
    playing.value = false
  }

  function seek(i: number) {
    const at = clampIndex(i, history.value.length)
    if (at >= 0) index.value = at
  }

  function goLive() {
    pause()
    index.value = null
  }

  function step(by: number) {
    seek((index.value ?? history.value.length - 1) + by)
  }

  function play() {
    if (history.value.length < 2) return
    pause()
    if (index.value === null || index.value >= history.value.length - 1) index.value = 0
    playing.value = true
    timer = setInterval(() => {
      if (index.value === null || index.value >= history.value.length - 1) return pause()
      index.value++
    }, stepMs)
  }

  function importText(text: string) {
    try {
      const imported = parseHistory(text, cap)
      pause()
      history.value = imported
      index.value = 0
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function onImportFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) importText(await readFileText(file))
    input.value = ''
  }

  function exportHistory() {
    if (history.value.length === 0) return
    downloadText(`topology-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, serializeHistory(history.value))
  }

  function clear() {
    goLive()
    history.value = []
    clearStoredHistory(storage)
  }

  onScopeDispose(pause)

  return { history, index, replaying, playing, error, saved, current, shown, diffs, markers, currentDiff, changeCount, seek, step, goLive, play, pause, importText, onImportFile, exportHistory, clear }
}
