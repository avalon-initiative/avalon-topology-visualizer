import { ref } from 'vue'
import { normalizeNodeUrl, walkTopology } from '@avalon-initiative/protocol-sdk'
import { summarizeGraph, type GraphSummary } from '../utils/summarizeGraph'

export function useSeedWalk(initialSeed = '') {
  const seedUrl = ref(initialSeed)
  const running = ref(false)
  const error = ref('')
  const summary = ref<GraphSummary | null>(null)

  async function run() {
    const seed = normalizeNodeUrl(seedUrl.value)
    if (!seed) {
      error.value = 'Enter an http(s) URL for a seed node.'
      summary.value = null
      return
    }
    running.value = true
    error.value = ''
    try {
      summary.value = summarizeGraph(await walkTopology([seed]))
    } catch (e) {
      summary.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      running.value = false
    }
  }

  return { seedUrl, running, error, summary, run }
}
