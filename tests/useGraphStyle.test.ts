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
})
