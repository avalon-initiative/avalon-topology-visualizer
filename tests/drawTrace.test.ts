import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, drawGraph } from '../src/utils/drawGraph'
import { drawTrace, packetPoint } from '../src/utils/drawTrace'
import type { Frame } from '../src/utils/traceAnimation'

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
