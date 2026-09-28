import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { createProber } from '../api/rttProber'
import type { ProberOptions } from '../api/rttProber'
import type { MergedGraph } from '../utils/mergeGraph'
import { pruneBook, rankReachable, recordOutcome, summarizeBook, viewerLinks, VIEWER_ID } from '../utils/rttStats'
import type { RttBook } from '../utils/rttStats'

/** Viewer-observed round trips to every node in the merged graph, measured only while switched on. */
export function useViewerRtt(merged: Ref<MergedGraph | null>, options: Partial<ProberOptions> = {}) {
  const running = ref(false)
  const book = shallowRef<RttBook>({})
  let pending: RttBook = {}

  const urls = () => merged.value?.nodes.map((n) => n.url) ?? []
  const prober = createProber({
    ...options,
    urls,
    onSample: (s) => {
      pending = recordOutcome(pending, s.url, s.rttMs)
    },
    onRound: () => {
      pending = pruneBook(pending, urls())
      book.value = pending
    },
  })

  const summaries = computed(() => summarizeBook(book.value, urls()))
  const ranking = computed(() => rankReachable(summaries.value))
  const links = computed(() => viewerLinks(summaries.value))
  const drawLinks = computed(() => links.value.map((l) => ({ a: l.a, b: l.b })))

  function toggle() {
    if (prober.running) prober.stop()
    else prober.start()
    running.value = prober.running
  }

  onScopeDispose(() => prober.stop())

  return { running, summaries, ranking, links, drawLinks, toggle, viewerId: VIEWER_ID }
}
