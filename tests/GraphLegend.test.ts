import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GraphLegend from '../src/components/GraphLegend.vue'
import { legendGroups } from '../src/utils/legend'

describe('GraphLegend', () => {
  const wrapper = mount(GraphLegend)
  const items = legendGroups().flatMap((g) => g.items)

  it('shows every group title and every entry in words', () => {
    for (const g of legendGroups()) expect(wrapper.text()).toContain(g.title)
    for (const i of items) expect(wrapper.text()).toContain(i.label)
  })

  it('draws a mark next to every entry', () => {
    expect(wrapper.findAll('li')).toHaveLength(items.length)
    expect(wrapper.findAll('li').every((li) => li.find('svg').exists())).toBe(true)
  })

  it('hides the marks from assistive tech, since the words carry the meaning', () => {
    expect(wrapper.findAll('svg').every((s) => s.attributes('aria-hidden') === 'true')).toBe(true)
  })

  it('draws role shapes as polygons and the circle as a circle', () => {
    const polygons = wrapper.findAll('li').filter((li) => li.text().includes('(square)') || li.text().includes('(hexagon)'))
    expect(polygons.every((li) => li.find('polygon').exists())).toBe(true)
    expect(wrapper.findAll('li').find((li) => li.text().includes('(circle)'))?.find('circle').exists()).toBe(true)
  })

  it('draws an arrowhead only on the mirror entry', () => {
    const withArrow = wrapper.findAll('li').filter((li) => li.find('svg polygon').exists() && li.text().startsWith('Mirror'))
    expect(withArrow).toHaveLength(1)
  })
})

describe('GraphLegend alerts and changes', () => {
  const wrapper = mount(GraphLegend)
  const item = (text: string) => wrapper.findAll('li').find((li) => li.text().includes(text))!

  it('draws a lettered badge for each alert entry and a dot on a line for the pulse', () => {
    expect(item('marked !').find('text').text()).toBe('!')
    expect(item('marked S').find('text').text()).toBe('S')
    expect(item('Changed since').find('line').exists()).toBe(true)
    expect(item('Changed since').find('circle').exists()).toBe(true)
  })
})
