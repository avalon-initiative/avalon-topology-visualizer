import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, drawGraph, nodeLabel, NODE_DRAW_RADIUS, PIN_RING_OFFSET, SELECT_RING_OFFSET } from '../src/utils/drawGraph'
import type { LinkStyle, NodeStyle } from '../src/utils/styleGraph'
import { VIEWER_ID, VIEWER_LABEL } from '../src/utils/rttStats'

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

  describe('labels', () => {
    const cluster = {
      ...base,
      positions: { 'http://192.168.7.113:8080': { x: 0, y: 0 }, 'http://192.168.7.174:8080': { x: 4, y: 3 }, 'http://192.168.7.183:8080': { x: 2, y: 8 }, 'http://192.168.7.204:8080': { x: 9, y: 6 } },
      links: [],
      view: { scale: 3, tx: 200, ty: 150 },
    }
    const plainStyle: NodeStyle = { shape: 'circle', hollow: false, dimmed: false, version: 'unknown', lag: 0 }
    const texts = (r: ReturnType<typeof recorder>) => r.of('fillText').map((c) => c.args[0] as string)

    it('draws every label of a tight cluster, none stacked on another', () => {
      const r = recorder()
      drawGraph(r.ctx, cluster)
      const at = r.of('fillText').map((c) => ({ x: c.args[1] as number, y: c.args[2] as number }))
      expect(texts(r).sort()).toEqual(['192.168.7.113:8080', '192.168.7.174:8080', '192.168.7.183:8080', '192.168.7.204:8080'])
      for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) expect(Math.abs(at[i].y - at[j].y) > 10 || Math.abs(at[i].x - at[j].x) > 60).toBe(true)
    })

    it('backs each label with a halo in the theme colour, under the text', () => {
      const r = recorder()
      drawGraph(r.ctx, { ...cluster, theme: { ...DEFAULT_THEME, halo: '#123456' } })
      expect(r.of('strokeText')).toHaveLength(4)
      const order = r.calls.map((c) => c.fn).filter((f) => f === 'strokeText' || f === 'fillText')
      expect(order.slice(0, 2)).toEqual(['strokeText', 'fillText'])
      expect(r.calls.filter((c) => c.fn === 'set:strokeStyle' && c.args[0] === '#123456')).toHaveLength(4)
    })

    it('draws a leader line for a label moved away from its node', () => {
      const r = recorder()
      const memory = new Map<string, string>()
      const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`http://192.168.7.${i + 100}:8080`, { x: (i % 4) * 3, y: Math.floor(i / 4) * 3 }]))
      drawGraph(r.ctx, { ...base, positions: many, links: [], view: { scale: 3, tx: 400, ty: 250 }, width: 800, height: 500, labelMemory: memory })
      expect([...memory.values()].some((slot) => !slot.endsWith(':0') && !slot.startsWith('hidden'))).toBe(true)
      expect(r.of('lineTo').length).toBeGreaterThan(0)
    })

    it('draws nothing for a label with no free slot', () => {
      const r = recorder()
      const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`http://192.168.7.${i + 100}:8080`, { x: (i % 4) * 3, y: Math.floor(i / 4) * 3 }]))
      drawGraph(r.ctx, { ...base, positions: many, links: [], view: { scale: 3, tx: 60, ty: 15 }, width: 130, height: 50 })
      expect(texts(r).length).toBeLessThan(12)
      expect(texts(r)).not.toContain('')
      expect(r.of('strokeText')).toHaveLength(texts(r).length)
    })

    it('shows the full URL for the hovered node and the short form when crowded out', () => {
      const tiny = { ...cluster, width: 130, height: 50, view: { scale: 3, tx: 60, ty: 15 } }
      const plain = recorder()
      drawGraph(plain.ctx, tiny)
      expect(texts(plain).some((t) => /^\.\d+$/.test(t))).toBe(true)
      const hover = recorder()
      drawGraph(hover.ctx, { ...tiny, hovered: 'http://192.168.7.204:8080' })
      expect(texts(hover)).toContain('192.168.7.204:8080')
    })

    it('always draws the full label of the selected, pinned and alerting nodes', () => {
      const tiny = { ...cluster, width: 130, height: 50, view: { scale: 3, tx: 60, ty: 15 } }
      const r = recorder()
      drawGraph(r.ctx, {
        ...tiny,
        selected: 'http://192.168.7.113:8080',
        pinned: new Set(['http://192.168.7.174:8080']),
        nodeStyles: { 'http://192.168.7.183:8080': { ...plainStyle, alerts: ['stale'] } },
      })
      expect(texts(r)).toEqual(expect.arrayContaining(['192.168.7.113:8080', '192.168.7.174:8080', '192.168.7.183:8080']))
    })

    it('draws a filter-dimmed node label at the faded opacity', () => {
      const r = recorder()
      drawGraph(r.ctx, { ...cluster, nodeStyles: { 'http://192.168.7.113:8080': { ...plainStyle, faded: true } } })
      const alphas = r.calls.filter((c) => c.fn === 'set:globalAlpha').map((c) => c.args[0])
      expect(alphas).toContain(0.15)
    })

    it('remembers slots between frames so labels do not move', () => {
      const memory = new Map<string, string>()
      drawGraph(recorder().ctx, { ...cluster, labelMemory: memory })
      const first = [...memory.entries()]
      expect(first).toHaveLength(4)
      const r = recorder()
      drawGraph(r.ctx, { ...cluster, labelMemory: memory })
      expect([...memory.entries()]).toEqual(first)
    })

    it('measures with the context when it can', () => {
      const r = recorder()
      const ctx = new Proxy(r.ctx as unknown as Record<string, unknown>, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 }) : t[k as string]) }) as unknown as CanvasRenderingContext2D
      drawGraph(ctx, base)
      expect(r.of('fillText')).toHaveLength(2)
    })
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
    expect(nodeLabel(VIEWER_ID)).toBe(VIEWER_LABEL)
    expect(VIEWER_LABEL).toBe('You (viewer-observed)')
  })
})

describe('link labels', () => {
  const labelled: LinkStyle[] = [{ kind: 'active', a: 'http://a:1', b: 'http://b:2', width: 1.5, alpha: 1, label: '12 ms by a:1' }]

  it('writes the label at the middle of the line, above it', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, linkStyles: labelled })
    const texts = r.of('fillText').map((c) => c.args)
    expect(texts).toContainEqual(['12 ms by a:1', 60, 45 - 4])
  })

  it('writes nothing for an unlabelled link, or one whose end is not placed', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, linkStyles: [{ ...labelled[0], label: undefined }, { ...labelled[0], b: 'http://gone' }] })
    expect(r.of('fillText').map((c) => c.args[0])).not.toContain('12 ms by a:1')
    expect(r.of('fillText')).toHaveLength(2)
  })
})

describe('drawGraph alerts, filters and pulses', () => {
  const style = (over: Partial<NodeStyle> = {}): NodeStyle => ({ shape: 'circle', hollow: false, dimmed: false, version: 'unknown', lag: 0, ...over })
  const link = (over: Partial<LinkStyle> = {}): LinkStyle => ({ kind: 'active', a: 'http://a:1', b: 'http://b:2', width: 1.5, alpha: 1, ...over })
  const dots = (r: ReturnType<typeof recorder>) => r.of('arc').filter((c) => c.args[2] === 3.5)
  const alphas = (r: ReturnType<typeof recorder>) => r.of('set:globalAlpha').map((c) => c.args[0])

  it('marks a node with a lettered badge per alert, next to the node', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, nodeStyles: { 'http://a:1': style({ alerts: ['equivocation', 'stale'] }) } })
    expect(r.of('fillText').map((c) => c.args[0])).toEqual(expect.arrayContaining(['!', 'S']))
    expect(r.of('set:fillStyle').map((c) => c.args[0])).toEqual(expect.arrayContaining([DEFAULT_THEME.danger, DEFAULT_THEME.warning]))
  })

  it('letters each badge by its own kind', () => {
    const letters = (alerts: NodeStyle['alerts']) => {
      const r = recorder()
      drawGraph(r.ctx, { ...base, nodeStyles: { 'http://a:1': style({ alerts }) } })
      return r.of('fillText').map((c) => c.args[0]).filter((t) => t === '!' || t === 'S')
    }
    expect(letters(['equivocation'])).toEqual(['!'])
    expect(letters(['stale'])).toEqual(['S'])
  })

  it('draws no badge without alerts', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, nodeStyles: { 'http://a:1': style() } })
    expect(r.of('fillText').map((c) => c.args[0])).not.toContain('!')
  })

  const lowest = (r: ReturnType<typeof recorder>) => Math.min(...(alphas(r) as number[]))

  it('draws a faded node fainter than a normal one, and fainter than a merely stale one', () => {
    const draw = (over: Partial<NodeStyle>) => {
      const r = recorder()
      drawGraph(r.ctx, { ...base, links: [], nodeStyles: { 'http://a:1': style(over) } })
      return lowest(r)
    }
    expect(draw({ faded: true })).toBeLessThan(draw({}))
    expect(draw({ faded: true })).toBeLessThan(draw({ dimmed: true }))
  })

  it('draws a faded link fainter than a normal one, even a bold one', () => {
    const draw = (over: Partial<LinkStyle>) => {
      const r = recorder()
      drawGraph(r.ctx, { ...base, linkStyles: [link(over)] })
      return alphas(r)[0] as number
    }
    expect(draw({ faded: true })).toBeLessThan(draw({}))
  })

  it('animates a pulse as a dot part-way along the link, and only on pulsed links', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, linkStyles: [link()], pulse: { keys: new Set(['http://a:1\nhttp://b:2']), progress: 0.5 } })
    const dot = dots(r)[0].args
    expect(dot[0]).toBeCloseTo((10 + 110) / 2)
    expect(dot[1]).toBeCloseTo((20 + 70) / 2)
    const none = recorder()
    drawGraph(none.ctx, { ...base, linkStyles: [link()], pulse: { keys: new Set(['other\nlink']), progress: 0.5 } })
    expect(dots(none)).toHaveLength(0)
  })

  it('draws a static dashed line instead of a moving dot when progress is null', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, linkStyles: [link()], pulse: { keys: new Set(['http://a:1\nhttp://b:2']), progress: null } })
    expect(dots(r)).toHaveLength(0)
    expect(r.of('setLineDash').some((c) => (c.args[0] as number[]).length > 0)).toBe(true)
  })

  it('draws a pulse once even when a link has both an active and a mirror line', () => {
    const r = recorder()
    const mirrorLine = link({ kind: 'mirror', direction: { from: 'http://a:1', to: 'http://b:2' } })
    drawGraph(r.ctx, { ...base, linkStyles: [link(), mirrorLine], pulse: { keys: new Set(['http://a:1\nhttp://b:2']), progress: 0.25 } })
    expect(dots(r)).toHaveLength(1)
  })

  it('does not pulse a faded link', () => {
    const r = recorder()
    drawGraph(r.ctx, { ...base, linkStyles: [link({ faded: true })], pulse: { keys: new Set(['http://a:1\nhttp://b:2']), progress: 0.5 } })
    expect(dots(r)).toHaveLength(0)
  })
})

describe('drawGraph shard regions', () => {
  const plain: NodeStyle = { shape: 'circle', hollow: false, dimmed: false, version: 'unknown', lag: 0 }
  const input = {
    ...base,
    nodeStyles: { 'http://a:1': { ...plain, shards: ['s1'] }, 'http://b:2': { ...plain, shards: ['s1'] } },
    shardKey: [{ id: 's1', color: 1, universal: false }],
    theme: { ...DEFAULT_THEME, shardPalette: ['#000001', '#000002'] },
  }

  it('outlines a region in the shard colour, dashed and unfilled, before any link or node, and labels it with the shard id', () => {
    const r = recorder()
    drawGraph(r.ctx, input)
    expect(r.calls.find((c) => c.fn === 'set:strokeStyle')?.args[0]).toBe('#000002')
    expect(r.calls.find((c) => c.fn === 'setLineDash')?.args[0]).toEqual([8, 4])
    expect(r.of('arc').slice(0, 2).map((c) => c.args[2])).toEqual([16, 16])
    expect(r.of('fill')).toHaveLength(2) // the two nodes only
    expect(r.of('fillText').map((c) => c.args[0])).toContain('shard s1')
  })

  it('draws no region when no node has a shard, or the member is filtered out', () => {
    const none = recorder()
    drawGraph(none.ctx, { ...input, shardKey: [] })
    expect(none.of('fillText').map((c) => c.args[0] as string).some((t) => t.startsWith('shard'))).toBe(false)
    const faded = recorder()
    drawGraph(faded.ctx, { ...input, nodeStyles: { 'http://a:1': { ...plain, shards: ['s1'], faded: true }, 'http://b:2': { ...plain, shards: ['s1'], faded: true } } })
    expect(faded.of('fillText').map((c) => c.args[0] as string).some((t) => t.startsWith('shard'))).toBe(false)
  })

  it('places a shard name clear of every node label, even when its node sits on the top edge of the canvas', () => {
    const r = recorder()
    const positions = { 'http://192.168.7.183:8080': { x: 0, y: 0 }, 'http://192.168.7.194:8080': { x: 300, y: 10 }, 'http://192.168.7.204:8080': { x: 100, y: 150 } }
    const styles = Object.fromEntries(Object.keys(positions).map((id) => [id, { ...plain, shards: ['core'] }]))
    drawGraph(r.ctx, { ...base, positions, links: [], nodeStyles: styles, shardKey: [{ id: 'core', color: 0 }], view: { scale: 1, tx: 50, ty: 4 }, width: 500, height: 300 })
    const texts = r.of('fillText').map((c) => ({ t: c.args[0] as string, x: c.args[1] as number, y: c.args[2] as number }))
    const shard = texts.find((t) => t.t === 'shard core')!
    expect(shard).toBeDefined()
    expect(shard.y).toBeGreaterThan(0)
    for (const n of texts.filter((t) => t.t !== 'shard core')) expect(Math.abs(n.y - shard.y) > 12 || Math.abs(n.x - shard.x) > 90).toBe(true)
  })
})
