import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FilterPanel from '../src/components/FilterPanel.vue'
import MotionToggle from '../src/components/MotionToggle.vue'
import { NO_FILTERS } from '../src/utils/filters'

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
    await wrapper.find('input[role="switch"]').setValue(false)
    expect(wrapper.emitted('mode')?.[1]).toEqual(['dim'])
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(mount(FilterPanel, { props: { ...props, active: false } }).find('button').exists()).toBe(false)
  })
})

describe('FilterPanel layout', () => {
  const options = { roles: ['gateway'], networkIds: [], versions: [], shards: ['node:' + 'ab12cd34'.repeat(8)] }
  const props = { filters: { ...NO_FILTERS }, options, mode: 'hide' as const, active: false, shown: 5, total: 5 }

  it('puts the count first and offers the hide setting as a labelled switch that is on in hide mode', () => {
    const wrapper = mount(FilterPanel, { props })
    expect(wrapper.get('section').element.firstElementChild?.textContent).toContain('Showing 5 of 5 nodes')
    const sw = wrapper.get('input[role="switch"]')
    expect((sw.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('Hide non-matching nodes')
    expect(wrapper.text()).toContain('removed from the map')
  })

  it('describes the current setting, not the opposite one', () => {
    const dim = mount(FilterPanel, { props: { ...props, mode: 'dim' as const } })
    expect(dim.text()).toContain('stay on the map, dimmed')
    expect(dim.text()).not.toContain('removed from the map')
  })

  it('shortens a long shard id but keeps the full value as its tooltip', () => {
    const wrapper = mount(FilterPanel, { props })
    const label = wrapper.findAll('fieldset label').find((l) => l.attributes('title')?.startsWith('node:'))!
    expect(label.attributes('title')).toBe(options.shards[0])
    expect(label.text().length).toBeLessThan(options.shards[0].length)
    expect(label.text()).toContain('…')
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
