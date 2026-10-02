import { describe, expect, it, vi } from 'vitest'
import type { TrustAnchorEntry } from '@avalon-initiative/protocol-sdk'
import { networkSeeds, walkableNetworks } from '../src/api/networks'
import { useCrawler } from '../src/composables/useCrawler'
import { useCrawlerForm } from '../src/composables/useCrawlerForm'

const entry = (over: Partial<TrustAnchorEntry>): TrustAnchorEntry => ({
  label: 'x',
  network_id: 'lan',
  verify_key: 'aa',
  signing_key_id: 'k',
  environment: 'dev',
  ...over,
})

describe('networkSeeds', () => {
  it('collects the server and seed nodes of the network once each, normalized', () => {
    const anchors = [entry({ server_url: 'http://a:8080/', seed_nodes: ['http://a:8080', 'http://b:8080'] }), entry({ network_id: 'other', seed_nodes: ['http://z'] })]
    expect(networkSeeds(anchors, 'lan')).toEqual(['http://a:8080', 'http://b:8080'])
  })
  it('is empty for an unknown network', () => {
    expect(networkSeeds([entry({ seed_nodes: ['http://a'] })], 'nope')).toEqual([])
  })
})

describe('walkableNetworks', () => {
  it('lists networks that have a node, once each', () => {
    const anchors = [entry({ seed_nodes: ['http://a'] }), entry({ seed_nodes: ['http://b'] }), entry({ network_id: 'empty', seed_nodes: [] })]
    expect(walkableNetworks(anchors)).toEqual([{ networkId: 'lan', environment: 'dev' }])
  })
})

describe('useCrawlerForm with networks', () => {
  const anchors = [entry({ seed_nodes: ['http://a:8080', 'http://b:8080'] })]

  it('walks a chosen network from all of its nodes and shows the first as the seed', async () => {
    const crawler = { start: vi.fn() } as unknown as ReturnType<typeof useCrawler>
    const form = useCrawlerForm(crawler, '', { anchorsUrl: 'u', fetchAnchors: vi.fn().mockResolvedValue(anchors) })
    await form.loadNetworks()
    expect(form.networks.value.map((n) => n.networkId)).toEqual(['lan'])
    form.walkNetwork('lan')
    expect(crawler.start).toHaveBeenCalledWith(['http://a:8080', 'http://b:8080'], {}, 30000)
    expect(form.seedUrl.value).toBe('http://a:8080')
    expect(form.selectedNetwork.value).toBe('lan')
  })

  it('a typed seed walk clears the network choice', async () => {
    const crawler = { start: vi.fn() } as unknown as ReturnType<typeof useCrawler>
    const form = useCrawlerForm(crawler, '', { anchorsUrl: 'u', fetchAnchors: vi.fn().mockResolvedValue(anchors) })
    await form.loadNetworks()
    form.walkNetwork('lan')
    form.seedUrl.value = 'http://typed'
    form.walk()
    expect(form.selectedNetwork.value).toBe('')
    expect(crawler.start).toHaveBeenLastCalledWith('http://typed', {}, 30000)
  })

  it('keeps the typed seed usable when the anchors cannot be read', async () => {
    const form = useCrawlerForm({ start: vi.fn() } as unknown as ReturnType<typeof useCrawler>, '', { anchorsUrl: 'u', fetchAnchors: vi.fn().mockRejectedValue(new Error('offline')) })
    await form.loadNetworks()
    expect(form.networks.value).toEqual([])
    expect(form.networksError.value).toBe('offline')
  })
})
