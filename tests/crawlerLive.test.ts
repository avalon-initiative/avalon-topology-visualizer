// @vitest-environment node
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveWalkSource } from '../src/api/graphSource'
import { mergeGraph } from '../src/utils/mergeGraph'

// Real SDK, real HTTP: three local "nodes". A knows B and a dead node, B knows A and a rate limiter.
const servers: Server[] = []
const urls: Record<string, string> = {}

function topology(neighbors: string[]) {
  return {
    generated_at: new Date().toISOString(),
    known: [],
    known_total: 0,
    mirrors: [],
    neighbors: neighbors.map((base_url) => ({ base_url, bootstrap: false, last_announced_at: null, roles: [] })),
    self: { network_id: 'test', protocol_version: '0', roles: [], shards: [], stale: false },
  }
}

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler)
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  })
}

beforeAll(async () => {
  urls.dead = 'http://127.0.0.1:1'
  urls.busy = await listen((_req, res) => {
    res.writeHead(429, { 'Retry-After': '600' }).end()
  })
  urls.b = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(topology([urls.a, urls.busy])))
  })
  urls.a = await listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(topology([urls.b, urls.dead])))
  })
})

afterAll(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))))

describe('live walk through the SDK', () => {
  it('merges partial views and names the nodes it could not read', async () => {
    const merged = mergeGraph(await liveWalkSource([urls.a], { requestTimeoutMs: 2000 }).load(new AbortController().signal, () => {}))
    expect(merged.visited).toBe(2)
    expect(merged.links.find((l) => l.a === [urls.a, urls.b].sort()[0] && l.b === [urls.a, urls.b].sort()[1])?.observations).toHaveLength(2)
    expect(merged.unreachable.map((n) => n.url)).toEqual([urls.dead])
    expect(merged.rateLimited.map((n) => n.url)).toEqual([urls.busy])
    expect(merged.components).toHaveLength(1)
  })

  it('stops at the node limit and says so', async () => {
    const merged = mergeGraph(await liveWalkSource([urls.a], { maxNodes: 2 }).load(new AbortController().signal, () => {}))
    expect(merged.stoppedAtLimit?.maxNodes).toBe(true)
  })
})
