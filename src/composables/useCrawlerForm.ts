import { ref, shallowRef } from 'vue'
import { defaultNetworkDeps, networkSeeds, walkableNetworks } from '../api/networks'
import type { NetworkDeps, NetworkOption } from '../api/networks'
import type { useCrawler } from './useCrawler'
import type { TrustAnchorEntry } from '@avalon-initiative/protocol-sdk'
import { downloadText, readFileText } from '../utils/snapshotFile'

const DEFAULT_REFRESH_SECONDS = '30'

/** Form state and file handling around a crawler; keeps the view glue-only. */
export function useCrawlerForm(crawler: ReturnType<typeof useCrawler>, initialSeed = '', networkDeps: NetworkDeps = defaultNetworkDeps) {
  const seedUrl = ref(initialSeed)
  const refreshSeconds = ref(DEFAULT_REFRESH_SECONDS)
  const networks = shallowRef<NetworkOption[]>([])
  const selectedNetwork = ref('')
  const networksError = ref('')
  let anchors: TrustAnchorEntry[] = []

  /** Reads the published networks; a failure leaves the typed seed URL as the way in. */
  async function loadNetworks() {
    try {
      anchors = await networkDeps.fetchAnchors(networkDeps.anchorsUrl)
      networks.value = walkableNetworks(anchors)
    } catch (err) {
      networksError.value = err instanceof Error ? err.message : String(err)
    }
  }

  function refreshMs() {
    const seconds = Number(refreshSeconds.value)
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
  }

  /** Walks the chosen network from all of its published nodes. */
  function walkNetwork(networkId: string) {
    const seeds = networkSeeds(anchors, networkId)
    selectedNetwork.value = networkId
    seedUrl.value = seeds[0] ?? ''
    return crawler.start(seeds, {}, refreshMs())
  }

  function walk() {
    selectedNetwork.value = ''
    return crawler.start(seedUrl.value, {}, refreshMs())
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

  return { seedUrl, refreshSeconds, networks, selectedNetwork, networksError, loadNetworks, walkNetwork, walk, onFile, save }
}
