import { fetchTrustAnchors, normalizeNodeUrl, TRUST_ANCHORS_URL } from '@avalon-initiative/protocol-sdk'
import type { TrustAnchorEntry } from '@avalon-initiative/protocol-sdk'

export interface NetworkOption {
  networkId: string
  environment: TrustAnchorEntry['environment']
}

/** The published trust anchors, injectable so tests never touch the network. */
export interface NetworkDeps {
  anchorsUrl: string
  fetchAnchors: (url: string) => Promise<TrustAnchorEntry[]>
}

export const defaultNetworkDeps: NetworkDeps = {
  anchorsUrl: import.meta.env.VITE_AVALON_TRUST_ANCHORS_URL || TRUST_ANCHORS_URL,
  fetchAnchors: (url) => fetchTrustAnchors(url),
}

/** Every server and seed node the anchors publish for `networkId`, once each. */
export function networkSeeds(anchors: TrustAnchorEntry[], networkId: string): string[] {
  const urls = anchors
    .filter((a) => a.network_id === networkId)
    .flatMap((a) => [...(a.server_url ? [a.server_url] : []), ...(a.seed_nodes ?? [])])
    .map((url) => normalizeNodeUrl(url))
  return [...new Set(urls.filter((url): url is string => !!url))]
}

/** Networks with at least one node to start a walk from. */
export function walkableNetworks(anchors: TrustAnchorEntry[]): NetworkOption[] {
  const seen = new Set<string>()
  const options: NetworkOption[] = []
  for (const a of anchors) {
    if (seen.has(a.network_id) || networkSeeds(anchors, a.network_id).length === 0) continue
    seen.add(a.network_id)
    options.push({ networkId: a.network_id, environment: a.environment })
  }
  return options
}
