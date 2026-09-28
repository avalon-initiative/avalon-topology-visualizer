import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, drawGraph, nodeLabel, NODE_DRAW_RADIUS, PIN_RING_OFFSET, SELECT_RING_OFFSET } from '../src/utils/drawGraph'
import type { LinkStyle, NodeStyle } from '../src/utils/styleGraph'

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
    expect(arcs[2].args[2]).toBe(NODE_DRAW_RADIUS + PIN_RING_OFFSET)
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
    drawGraph(r.ctx, { ...base, theme: { ...DEFAULT_THEME, link: '#111', node: '#222', pinned: '#333', label: '#444' } })
    const sets = r.calls.filter((c) => c.fn.startsWith('set:')).map((c) => c.args[0])
    expect(sets).toEqual(expect.arrayContaining(['#111', '#222', '#444']))
  })

  describe('styled links', () => {
    const link = (kind: LinkStyle['kind'], extra: Partial<LinkStyle> = {}): LinkStyle => ({ kind, a: 'http://a:1', b: 'http://b:2', width: 2, alpha: 1, ...extra })
    const styled = (linkStyles: LinkStyle[]) => {
      const r = recorder()
      drawGraph(r.ctx, { ...base, linkStyles })
      return r
    }

    it('draws an active link solid', () => {
      const r = styled([link('active')])
      expect(r.of('setLineDash').map((c) => c.args[0])).toContainEqual([])
      expect(r.of('setLineDash').map((c) => c.args[0])).not.toContainEqual([4, 4])
    })

    it('draws a known link dashed and faint', () => {
      const r = styled([link('known', { alpha: 0.5, width: 1 })])
      expect(r.of('setLineDash').map((c) => c.args[0])).toContainEqual([4, 4])
      expect(r.calls.filter((c) => c.fn === 'set:globalAlpha').map((c) => c.args[0])).toContain(0.5)
    })

    it('draws a mirror link in the mirror colour, with an arrowhead', () => {
      const r = styled([link('mirror', { direction: { from: 'http://a:1', to: 'http://b:2' } })])
      expect(r.calls.filter((c) => c.fn === 'set:strokeStyle').map((c) => c.args[0])).toContain(DEFAULT_THEME.mirror)
      expect(r.of('fill').length).toBeGreaterThanOrEqual(1)
      expect(r.of('closePath')).toHaveLength(1)
    })

    it('points the arrowhead toward the node that copies the data', () => {
      const tip = (direction: { from: string; to: string }) => styled([link('mirror', { direction })]).of('moveTo')[1].args as number[]
      const aToB = tip({ from: 'http://a:1', to: 'http://b:2' })
      const bToA = tip({ from: 'http://b:2', to: 'http://a:1' })
      // a is at screen x=10 and b at x=110, so the arrow tip sits right of centre toward b, and left of it toward a.
      expect(aToB[0]).toBeGreaterThan(bToA[0])
    })

    it('does not draw an arrowhead for active or known links', () => {
      expect(styled([link('active'), link('known')]).of('closePath')).toHaveLength(0)
    })

    it('offsets a mirror line from an active line between the same nodes', () => {
      const r = styled([link('active'), link('mirror', { direction: { from: 'http://a:1', to: 'http://b:2' } })])
      const moves = r.of('moveTo').map((c) => c.args as number[])
      expect(moves[0]).not.toEqual(moves[1])
    })

    it('sets the width from the link style', () => {
      expect(styled([link('active', { width: 3.5 })]).calls.filter((c) => c.fn === 'set:lineWidth').map((c) => c.args[0])).toContain(3.5)
    })
  })

  describe('styled nodes', () => {
    const node = (extra: Partial<NodeStyle> = {}): NodeStyle => ({ shape: 'circle', hollow: false, dimmed: false, version: 'unknown', lag: 0, ...extra })
    const drawWith = (nodeStyles: Record<string, NodeStyle>, extra: object = {}) => {
      const r = recorder()
      drawGraph(r.ctx, { ...base, nodeStyles, ...extra })
      return r
    }
    const a = 'http://a:1'

    it('draws a role as a polygon, not an arc', () => {
      const r = drawWith({ [a]: node({ shape: 'square' }) })
      expect(r.of('closePath')).toHaveLength(1)
      expect(r.of('lineTo').length).toBeGreaterThanOrEqual(4)
    })

    it('fills a read node and only outlines one that was not read', () => {
      const filled = drawWith({ [a]: node() })
      const hollow = drawWith({ [a]: node({ hollow: true }) })
      expect(filled.of('fill').length).toBeGreaterThan(hollow.of('fill').length)
    })

    it('fades a stale node and restores the drawing state around it', () => {
      const r = drawWith({ [a]: node({ dimmed: true }) })
      expect(r.calls.filter((c) => c.fn === 'set:globalAlpha').map((c) => c.args[0])).toContain(0.4)
      expect(r.of('save').length).toBe(r.of('restore').length)
    })

    it.each([
      ['newest', [] as number[]],
      ['behind', [3, 3]],
      ['unknown', [1, 3]],
    ] as const)('rings a node by version state %s with its own dash pattern', (version, dash) => {
      const r = drawWith({ [a]: node({ version }) })
      expect(r.of('setLineDash').map((c) => c.args[0])).toContainEqual(dash)
      expect(r.of('arc').some((c) => c.args[2] === NODE_DRAW_RADIUS + 3)).toBe(true)
    })

    it('draws a lag arc that sweeps in proportion to the lag', () => {
      const sweep = (lag: number) => {
        const arcs = drawWith({ [a]: node({ lag, version: 'newest' }) }).of('arc').filter((c) => c.args[2] === NODE_DRAW_RADIUS + 6)
        return arcs.length === 0 ? 0 : (arcs[0].args[4] as number) - (arcs[0].args[3] as number)
      }
      expect(sweep(0)).toBe(0)
      expect(sweep(0.5)).toBeCloseTo(Math.PI)
      expect(sweep(1)).toBeCloseTo(Math.PI * 2)
    })

    it('outlines the selected node and only that node', () => {
      const r = drawWith({}, { selected: 'http://b:2' })
      const rings = r.of('arc').filter((c) => c.args[2] === NODE_DRAW_RADIUS + SELECT_RING_OFFSET)
      expect(rings).toHaveLength(1)
      expect(rings[0].args.slice(0, 2)).toEqual([110, 70])
    })

    it('draws nodes without a style as plain filled circles', () => {
      const r = drawWith({})
      expect(r.of('closePath')).toHaveLength(0)
      expect(r.of('fill')).toHaveLength(2)
    })
  })
})

describe('nodeLabel', () => {
  it('shows the host and port of a URL, and falls back to the raw id', () => {
    expect(nodeLabel('https://node.example:8443/x')).toBe('node.example:8443')
    expect(nodeLabel('not a url')).toBe('not a url')
  })
})
