import { describe, expect, it } from 'vitest'
import { drawGraph, nodeLabel, NODE_DRAW_RADIUS } from '../src/utils/drawGraph'

/** Records every call and property set on a fake 2D context. */
function recorder() {
  const calls: { fn: string; args: unknown[] }[] = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) => (key in props ? props[key] : (...args: unknown[]) => calls.push({ fn: key, args })),
    set: (_t, key: string, value) => {
      props[key] = value
      calls.push({ fn: `set:${key}`, args: [value] })
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, of: (fn: string) => calls.filter((c) => c.fn === fn) }
}

const view = { scale: 2, tx: 10, ty: 20 }
const base = {
  positions: { 'http://a:1': { x: 0, y: 0 }, 'http://b:2': { x: 50, y: 25 } },
  links: [{ a: 'http://a:1', b: 'http://b:2' }],
  pinned: new Set<string>(),
  view,
  width: 400,
  height: 300,
}

describe('drawGraph', () => {
  it('clears the whole canvas first', () => {
    const r = recorder()
    drawGraph(r.ctx, base)
    expect(r.calls[0]).toEqual({ fn: 'clearRect', args: [0, 0, 400, 300] })
  })

  it('draws each link between the two nodes at their screen positions', () => {
    const r = recorder()
    drawGraph(r.ctx, base)
    expect(r.of('moveTo')).toEqual([{ fn: 'moveTo', args: [10, 20] }])
    expect(r.of('lineTo')).toEqual([{ fn: 'lineTo', args: [110, 70] }])
    expect(r.of('stroke')).toHaveLength(1)
  })

  it('draws one dot per node at its screen position', () => {
    const r = recorder()
    drawGraph(r.ctx, base)
    expect(r.of('arc').map((c) => c.args.slice(0, 3))).toEqual([
      [10, 20, NODE_DRAW_RADIUS],
      [110, 70, NODE_DRAW_RADIUS],
    ])
  })

  it('rings a pinned node and only that node', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, pinned: new Set(['http://b:2']) })
    const arcs = r.of('arc')
    expect(arcs).toHaveLength(3)
    expect(arcs[2].args[2]).toBe(NODE_DRAW_RADIUS + 3)
    expect(arcs[2].args.slice(0, 2)).toEqual([110, 70])
  })

  it('labels each node with its host', () => {
    const r = recorder()
    drawGraph(r.ctx, base)
    expect(r.of('fillText').map((c) => c.args[0])).toEqual(['a:1', 'b:2'])
  })

  it('skips a link whose end has no position', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, links: [{ a: 'http://a:1', b: 'http://missing' }] })
    expect(r.of('lineTo')).toHaveLength(0)
  })

  it('draws nothing but the clear for an empty graph', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, positions: {}, links: [] })
    expect(r.calls.filter((c) => !c.fn.startsWith('set:')).map((c) => c.fn)).toEqual(['clearRect'])
  })

  it('uses the theme colours it is given', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, theme: { link: '#111', node: '#222', pinned: '#333', label: '#444', background: 'none' } })
    const sets = r.calls.filter((c) => c.fn.startsWith('set:')).map((c) => c.args[0])
    expect(sets).toEqual(expect.arrayContaining(['#111', '#222', '#444']))
  })
})

describe('nodeLabel', () => {
  it('shows the host and port of a URL, and falls back to the raw id', () => {
    expect(nodeLabel('https://node.example:8443/x')).toBe('node.example:8443')
    expect(nodeLabel('not a url')).toBe('not a url')
  })
})
