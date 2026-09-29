import { shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { MergedGraph } from '../utils/mergeGraph'
import { historyRows, recordCrawl } from '../utils/rttHistory'
import type { CrawlHistory } from '../utils/rttHistory'
import type { RttBook } from '../utils/rttStats'

/** A bounded per-node record of the round trips each refresh measured, joined with the viewer's own samples for display. */
export function useNodeHistory(merged: Ref<MergedGraph | null>, viewerBook?: Ref<RttBook>, now: () => number = Date.now) {
  const crawl = shallowRef<CrawlHistory>({})
  watch(merged, (m) => {
    crawl.value = m ? recordCrawl(crawl.value, m, now()) : {}
  }, { immediate: true })

  const rowsFor = (url: string) => historyRows(crawl.value[url], viewerBook?.value[url])
  return { crawl, rowsFor }
}
