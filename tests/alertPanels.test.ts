import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AlertList from '../src/components/AlertList.vue'
import FilterPanel from '../src/components/FilterPanel.vue'
import MotionToggle from '../src/components/MotionToggle.vue'
import { NO_FILTERS } from '../src/utils/filters'
import type { Alert } from '../src/utils/alerts'

const alerts: Alert[] = [
  { id: 'e1', kind: 'equivocation', url: 'http://a', title: 'Open equivocation on shard s1', detail: 'Sources x and y disagree at tree size 7' },
  { id: 's1', kind: 'stale', url: 'http://b', title: 'Reports itself stale', detail: 'behind' },
]

describe('AlertList', () => {
  it('renders nothing without alerts', () => {
    expect(mount(AlertList, { props: { alerts: [] } }).find('section').exists()).toBe(false)
  })

  it('names each alert by kind in words, with its URL and detail, and counts them', () => {
    const wrapper = mount(AlertList, { props: { alerts } })
    expect(wrapper.find('h3').text()).toBe('Alerts (2)')
    const items = wrapper.findAll('li')
    expect(items[0].text()).toContain('Equivocation')
    expect(items[0].text()).toContain('tree size 7')
    expect(items[1].text()).toContain('Stale')
  })

  it('selects the node when its URL is clicked', async () => {
    const wrapper = mount(AlertList, { props: { alerts } })
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([['http://b']])
  })
})

describe('FilterPanel', () => {
  const options = { roles: ['gateway', 'hoster'], networkIds: ['net-a'], versions: [], shards: ['s1'] }
  const props = { filters: { ...NO_FILTERS, roles: ['gateway'] }, options, mode: 'dim' as const, active: true, shown: 1, total: 3 }

  it('offers a checkbox for each present value and hides a facet with none', () => {
    const wrapper = mount(FilterPanel, { props })
    const visibleLegends = wrapper.findAll('fieldset').filter((f) => (f.element as HTMLElement).style.display !== 'none')
    expect(visibleLegends.map((f) => f.find('legend').text())).toEqual(['Role', 'Network id', 'Shard'])
    expect(wrapper.text()).toContain('Showing 1 of 3 nodes')
  })

  it('reflects the chosen values and emits toggles with facet and value', async () => {
    const wrapper = mount(FilterPanel, { props })
    const boxes = wrapper.findAll('fieldset input')
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((boxes[1].element as HTMLInputElement).checked).toBe(false)
    await boxes[1].setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([['roles', 'hoster']])
  })

  it('emits the search text, the mode switch and clear, and offers clear only while a filter is on', async () => {
    const wrapper = mount(FilterPanel, { props })
    await wrapper.find('input[type="text"]').setValue('gw')
    expect(wrapper.emitted('search')?.[0]).toEqual(['gw'])
    await wrapper.findAll('input[type="checkbox"]').at(-1)!.setValue(true)
    expect(wrapper.emitted('mode')).toEqual([['hide']])
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(mount(FilterPanel, { props: { ...props, active: false } }).find('button').exists()).toBe(false)
  })
})

describe('MotionToggle', () => {
  it('shows the current state and emits on change', async () => {
    const wrapper = mount(MotionToggle, { props: { reduced: true } })
    const box = wrapper.find('input')
    expect((box.element as HTMLInputElement).checked).toBe(true)
    await box.setValue(false)
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
