import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, drawGraph } from '../src/utils/drawGraph'
import { drawTrace, packetPoint } from '../src/utils/drawTrace'
import type { Frame } from '../src/utils/traceAnimation'
import { summarizeTrace } from '../src/utils/traceSummary'
import { reached } from './traces'

function recorder() {
  const calls: { fn: string; args: unknown[] }[] = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) => (key in props ? props[key] : (...args: unknown[]) => calls.push({ fn: key, args })),
    set: (_t, key: string, value) => ((props[key] = value), calls.push({ fn: `set:${key}`, args: [value] }), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, of: (fn: string) => calls.filter((c) => c.fn === fn) }
}

const view = { scale: 1, tx: 0, ty: 0 }
const positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 100, y: 100 } }
const hops = summarizeTrace(reached()).rows.map((r, i) => ({ ...r, url: ['a', 'b', 'c'][i] }))
const texts = (r: ReturnType<typeof recorder>) => r.of('fillText').map((c) => c.args[0])
const frame = (over: Partial<Frame> = {}): Frame => ({ segment: 0, from: 'a', to: 'b', fraction: 0.5, direction: 'out', kind: 'transit', reachedOut: [], finished: false, ...over })

describe('packetPoint', () => {
  it('sits between the ends by the fraction', () => {
    expect(packetPoint(frame(), positions)).toEqual({ x: 50, y: 0 })
  })

  it('stays at the known end when the other is not on the map, and is null when neither is', () => {
    expect(packetPoint(frame({ to: 'zz' }), positions)).toEqual({ x: 0, y: 0 })
    expect(packetPoint(frame({ from: 'yy', to: 'zz' }), positions)).toBeNull()
  })
})

describe('drawTrace', () => {
  it('draws the path through known nodes in order, skipping ones not on the map', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['a', 'missing', 'b', 'c'], frame: null }, positions, view, DEFAULT_THEME)
    expect(r.of('moveTo').map((c) => c.args)).toEqual([[0, 0]])
    expect(r.of('lineTo').map((c) => c.args)).toEqual([[100, 0], [100, 100]])
  })

  it('draws the packet in the warning colour at its position, and nothing without a frame', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['a', 'b'], frame: frame() }, positions, view, DEFAULT_THEME)
    expect(r.of('arc').at(-1)?.args.slice(0, 2)).toEqual([50, 0])
    const none = recorder()
    drawTrace(none.ctx, { path: ['a', 'b'], frame: null }, positions, view, DEFAULT_THEME)
    expect(none.of('arc')).toHaveLength(0)
  })

  it('rings each node reached and marks where a stopped trace ended in the danger colour', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['a', 'b'], frame: frame({ reachedOut: ['a', 'b'] }), stoppedAt: 'b' }, positions, view, DEFAULT_THEME)
    expect(r.of('arc').slice(0, 3).map((c) => c.args.slice(0, 2))).toEqual([[0, 0], [100, 0], [100, 0]])
    expect(r.calls.some((c) => c.fn === 'set:strokeStyle' && c.args[0] === DEFAULT_THEME.danger)).toBe(true)
  })

  it('draws the temporary viewer marker with its label and starts the path from it', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['viewer', 'a', 'b'], frame: null, viewer: { id: 'viewer', at: { x: -40, y: -40 }, label: 'This browser' } }, positions, view, DEFAULT_THEME)
    expect(r.of('moveTo')[0].args).toEqual([-40, -40])
    expect(texts(r)).toContain('This browser')
    const without = recorder()
    drawTrace(without.ctx, { path: ['viewer', 'a', 'b'], frame: null }, positions, view, DEFAULT_THEME)
    expect(texts(without)).not.toContain('This browser')
    expect(without.of('moveTo')[0].args).toEqual([0, 0])
  })

  it('numbers each hop once the packet has reached it, with its processing and forward time', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['a', 'b', 'c'], frame: frame({ reachedOut: ['a', 'b'] }), hops }, positions, view, DEFAULT_THEME)
    expect(texts(r)).toEqual(['1', 'proc 2.0 ms · fwd 20 ms', '2', 'proc 3.0 ms · fwd 10 ms'])
  })

  it('draws the active hop badge in the warning colour and the others in the success colour', () => {
    const fills = (active: number | null) => {
      const r = recorder()
      drawTrace(r.ctx, { path: ['a', 'b'], frame: frame({ reachedOut: ['a', 'b'] }), hops, activeHop: active }, positions, view, DEFAULT_THEME)
      return r.calls.filter((c) => c.fn === 'set:fillStyle').map((c) => c.args[0])
    }
    const warm = (a: number | null) => fills(a).filter((f) => f === DEFAULT_THEME.warning).length
    // The packet itself is also warning coloured, so the active badge is the one extra.
    expect(warm(0)).toBe(warm(null) + 1)
    expect(warm(1)).toBe(warm(0))
  })

  it('fades a trail behind the packet, oldest faintest, and draws none when it has not moved', () => {
    const r = recorder()
    const trail = [frame({ fraction: 0.4 }), frame({ fraction: 0.3 }), frame({ fraction: 0.2 })]
    drawTrace(r.ctx, { path: ['a', 'b'], frame: frame(), trail }, positions, view, DEFAULT_THEME)
    const alphas = r.calls.filter((c) => c.fn === 'set:globalAlpha').map((c) => c.args[0] as number)
    expect(alphas).toHaveLength(3)
    expect(alphas[0]).toBeGreaterThan(alphas[1])
    expect(alphas[1]).toBeGreaterThan(alphas[2])
    const still = recorder()
    drawTrace(still.ctx, { path: ['a', 'b'], frame: frame(), trail: [frame(), frame()] }, positions, view, DEFAULT_THEME)
    expect(still.calls.some((c) => c.fn === 'set:globalAlpha')).toBe(false)
  })

  it('labels the end marker of a stopped trace', () => {
    const r = recorder()
    drawTrace(r.ctx, { path: ['a', 'b'], frame: frame({ reachedOut: ['a', 'b'] }), stoppedAt: 'b', stoppedLabel: 'No route' }, positions, view, DEFAULT_THEME)
    expect(texts(r)).toContain('Stopped: No route')
  })

  it('puts the stop tag on the side away from the viewer marker', () => {
    const tagY = (viewerAt: { x: number; y: number }) => {
      const r = recorder()
      const trace = { path: ['viewer', 'a', 'b'], frame: frame({ reachedOut: ['a', 'b'] }), stoppedAt: 'b', stoppedLabel: 'No route', viewer: { id: 'viewer', at: viewerAt, label: 'This browser' } }
      drawTrace(r.ctx, trace, positions, view, DEFAULT_THEME)
      const i = r.of('fillText').findIndex((c) => c.args[0] === 'Stopped: No route')
      return r.of('fillText')[i].args[2] as number
    }
    expect(tagY({ x: 100, y: -80 })).toBeGreaterThan(0)
    expect(tagY({ x: 100, y: 80 })).toBeLessThan(0)
  })

  it('is drawn on top of the graph by drawGraph only when a trace is given', () => {
    const input = { positions, links: [{ a: 'a', b: 'b' }], pinned: new Set<string>(), view, width: 200, height: 200 }
    const plain = recorder()
    drawGraph(plain.ctx, input)
    const traced = recorder()
    drawGraph(traced.ctx, { ...input, trace: { path: ['a', 'b'], frame: frame() } })
    expect(traced.calls.length).toBeGreaterThan(plain.calls.length)
    expect(traced.calls.slice(0, plain.calls.length)).toEqual(plain.calls)
  })
})
