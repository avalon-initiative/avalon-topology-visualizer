// @vitest-environment node
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProber } from '../src/api/rttProber'
import type { RttSample } from '../src/api/rttProber'

// Real fetch against local "nodes": a fast one, a slow one, a rate limiter, a hung one and a closed port.
const servers: Server[] = []
const urls: Record<string, string> = {}
const seen: { url?: string; cookie?: string; authorization?: string }[] = []

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler)
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  })
}

beforeAll(async () => {
  urls.dead = 'http://127.0.0.1:1'
  urls.fast = await listen((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization })
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }).end('{}')
  })
  urls.slow = await listen((_req, res) => {
    setTimeout(() => res.writeHead(200).end('{}'), 80)
  })
  urls.busy = await listen((_req, res) => {
    res.writeHead(429, { 'Retry-After': '600' }).end()
  })
  urls.hung = await listen(() => undefined)
})

afterAll(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))))

describe('prober over real HTTP', () => {
  it('times real responses and records every failure kind as loss', async () => {
    const samples: RttSample[] = []
    const prober = createProber({
      urls: () => Object.values(urls),
      onSample: (s) => samples.push(s),
      onRound: () => prober.stop(),
      timeoutMs: 400,
      intervalMs: 60_000,
    })
    prober.start()
    const started = Date.now()
    while (samples.length < 5 && Date.now() - started < 5000) await new Promise((r) => setTimeout(r, 10))
    expect(samples).toHaveLength(5)
    const by = (base: string) => samples.find((s) => s.url === base)!
    expect(by(urls.fast).rttMs).not.toBeNull()
    expect(by(urls.slow).rttMs).toBeGreaterThanOrEqual(70)
    expect(by(urls.slow).rttMs as number).toBeGreaterThan(by(urls.fast).rttMs as number)
    expect(by(urls.busy)).toMatchObject({ rttMs: null, reason: 'rate_limited', retryAfterMs: 600_000 })
    expect(by(urls.hung)).toMatchObject({ rttMs: null, reason: 'timeout' })
    expect(by(urls.dead)).toMatchObject({ rttMs: null, reason: 'network' })
    expect(seen).toEqual([{ url: '/nodes/status' }])
  })
})
