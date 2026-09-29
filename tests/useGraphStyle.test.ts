import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useGraphStyle } from '../src/composables/useGraphStyle'
import { mergeGraph } from '../src/utils/mergeGraph'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { edge, graph, mirror, visited } from './graphs'

const build = (urls: string[]): MergedGraph =>
  mergeGraph(graph(urls.map((u) => visited(u, { roles: ['gateway'] })), urls.length > 1 ? [edge(urls[0], urls[1], 'active', 9), mirror(urls[0], urls[1], 4)] : []))

function make(initial: MergedGraph | null) {
  const source = ref<MergedGraph | null>(initial)
  const api = effectScope().run(() => useGraphStyle(source))!
  return { source, api }
}

describe('useGraphStyle', () => {
  it('styles every node and every link of the merged graph', () => {
    const { api } = make(build(['http://a', 'http://b']))
    expect(Object.keys(api.nodeStyles.value)).toEqual(['http://a', 'http://b'])
    expect(api.nodeStyles.value['http://a'].shape).toBe('hexagon')
    expect(api.links.value.map((l) => l.kind).sort()).toEqual(['active', 'mirror'])
  })

  it('has nothing to style without a graph', () => {
    const { api } = make(null)
    expect(api.nodeStyles.value).toEqual({})
    expect(api.links.value).toEqual([])
    expect(api.detail.value).toBeNull()
  })

  it('offers detail for the selected node only', () => {
    const { api } = make(build(['http://a', 'http://b']))
    expect(api.detail.value).toBeNull()
    api.selected.value = 'http://b'
    expect(api.detail.value?.title).toBe('http://b')
    expect(api.detail.value?.rows.find((r) => r.label === 'URL')?.value).toBe('http://b')
  })

  it('drops the selection when a refresh no longer has that node', async () => {
    const { source, api } = make(build(['http://a', 'http://b']))
    api.selected.value = 'http://b'
    source.value = build(['http://a'])
    await nextTick()
    expect(api.selected.value).toBeUndefined()
    expect(api.detail.value).toBeNull()
  })

  it('keeps the selection across a refresh that still has the node', async () => {
    const { source, api } = make(build(['http://a', 'http://b']))
    api.selected.value = 'http://a'
    source.value = build(['http://a', 'http://b'])
    await nextTick()
    expect(api.selected.value).toBe('http://a')
  })

  it('clears the selection when the graph goes away', async () => {
    const { source, api } = make(build(['http://a']))
    api.selected.value = 'http://a'
    source.value = null
    await nextTick()
    expect(api.selected.value).toBeUndefined()
  })

  it('draws extra links (the viewer\'s own) as plain lines alongside the crawl\'s links', () => {
    const source = ref<MergedGraph | null>(build(['http://a', 'http://b']))
    const extra = ref([{ a: 'viewer:this-browser', b: 'http://a' }])
    const api = effectScope().run(() => useGraphStyle(source, extra))!
    const viewerLine = api.links.value.find((l) => l.a === 'viewer:this-browser')
    expect(viewerLine).toMatchObject({ kind: 'active', b: 'http://a' })
    expect(api.links.value).toHaveLength(3)
  })

  it('has no extra links without a graph, and follows the extra links as they change', () => {
    const source = ref<MergedGraph | null>(null)
    const extra = ref([{ a: 'viewer:this-browser', b: 'http://a' }])
    const api = effectScope().run(() => useGraphStyle(source, extra))!
    expect(api.links.value).toEqual([])
    source.value = build(['http://a', 'http://b'])
    expect(api.links.value).toHaveLength(3)
    extra.value = []
    expect(api.links.value).toHaveLength(2)
  })
})

describe('useGraphStyle labelled extra links', () => {
  it('draws an extra link with its label, and leaves the label off when there is none', () => {
    const source = ref<MergedGraph | null>(build(['http://a', 'http://b']))
    const extra = ref([{ a: 'http://a', b: 'http://b', label: '9 ms by a' }, { a: 'http://b', b: 'http://a' }])
    const api = effectScope().run(() => useGraphStyle(source, extra))!
    const drawn = api.links.value.filter((l) => l.kind === 'active').slice(1)
    expect(drawn[0].label).toBe('9 ms by a')
    expect(drawn[1]).not.toHaveProperty('label')
  })
})
