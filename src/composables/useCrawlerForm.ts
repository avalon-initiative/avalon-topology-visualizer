import { ref } from 'vue'
import type { useCrawler } from './useCrawler'
import { downloadText, readFileText } from '../utils/snapshotFile'

const DEFAULT_REFRESH_SECONDS = '30'

/** Form state and file handling around a crawler; keeps the view glue-only. */
export function useCrawlerForm(crawler: ReturnType<typeof useCrawler>, initialSeed = '') {
  const seedUrl = ref(initialSeed)
  const refreshSeconds = ref(DEFAULT_REFRESH_SECONDS)

  function walk() {
    const seconds = Number(refreshSeconds.value)
    return crawler.start(seedUrl.value, {}, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0)
  }

  async function onFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) crawler.loadSnapshot(await readFileText(file))
    input.value = ''
  }

  function save() {
    const text = crawler.saveSnapshot()
    if (text) downloadText(`topology-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, text)
  }

  return { seedUrl, refreshSeconds, walk, onFile, save }
}
