import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FilterBar from '../src/components/FilterBar.vue'
import { NO_FILTERS } from '../src/utils/filters'

const shard = 'node:' + '07ea'.repeat(15) + '071d'
const options = { roles: ['combined', 'gateway'], networkIds: ['net-a'], versions: [], shards: [shard] }
const props = (extra: Record<string, unknown> = {}) => ({ filters: { ...NO_FILTERS }, options, mode: 'dim' as const, active: false, shown: 5, total: 5, ...extra })
const make = (extra: Record<string, unknown> = {}) => mount(FilterBar, { props: props(extra) })

describe('FilterBar', () => {
  it('offers a button per facet that has values, and none for an empty facet', () => {
    expect(make().findAll('button[aria-haspopup]').map((b) => b.text())).toEqual(['Role', 'Network', 'Shard'])
  })

  it('shows the shard with a shortened label and the full id as its tooltip', () => {
    const label = make().findAll('label').find((l) => l.attributes('title') === shard)!
    expect(label.text()).toContain('…')
    expect(label.text().length).toBeLessThan(shard.length)
  })

  it('emits the full new value list of a facet when a value is ticked', async () => {
    const w = make({ filters: { ...NO_FILTERS, roles: ['combined'] } })
    const group = w.findAll('[role="group"]').find((g) => g.attributes('aria-label') === 'Role')!
    await group.findAll('label').find((l) => l.text() === 'gateway')!.get('input').setValue(true)
    expect(w.emitted('facet')).toEqual([['roles', ['combined', 'gateway']]])
  })

  it('emits the search text as it is typed', async () => {
    const w = make()
    await w.get('input[type="text"]').setValue('gw')
    expect(w.emitted('search')).toEqual([['gw']])
  })

  it('shows one removable chip per active value and asks to remove the one clicked', async () => {
    const w = make({ filters: { ...NO_FILTERS, roles: ['combined', 'gateway'], shards: [shard], search: 'gw' }, active: true })
    const chips = w.findAll('[data-testid="filter-chips"] li')
    expect(chips).toHaveLength(4)
    expect(chips[0].text()).toContain('Role: combined')
    expect(chips[2].find('[title]').attributes('title')).toBe(`Shard: ${shard}`)
    expect(chips[3].text()).toContain('URL: gw')
    await chips[1].get('button').trigger('click')
    expect(w.emitted('removeChip')![0][0]).toMatchObject({ id: 'roles:gateway', facet: 'roles', value: 'gateway' })
  })

  it('shows no chip row without filters', () => {
    expect(make().find('[data-testid="filter-chips"]').exists()).toBe(false)
  })

  it('shows the count as a status and Clear only while a filter is active', async () => {
    expect(make().get('[role="status"]').text()).toBe('Showing 5 of 5 nodes')
    expect(make().findAll('button').some((b) => b.text() === 'Clear filters')).toBe(false)
    const w = make({ active: true, shown: 1 })
    expect(w.get('[role="status"]').text()).toBe('Showing 1 of 5 nodes')
    await w.findAll('button').find((b) => b.text() === 'Clear filters')!.trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })

  it('has a hide switch that describes the current setting and emits the mode', async () => {
    const dim = make()
    expect(dim.text()).toContain('Non-matching nodes stay on the map, dimmed.')
    await dim.get('input[role="switch"]').setValue(true)
    expect(dim.emitted('mode')).toEqual([['hide']])
    const hide = make({ mode: 'hide' })
    expect(hide.text()).toContain('Non-matching nodes are removed from the map.')
    expect((hide.get('input[role="switch"]').element as HTMLInputElement).checked).toBe(true)
    await hide.get('input[role="switch"]').setValue(false)
    expect(hide.emitted('mode')).toEqual([['dim']])
  })

  it('has a narrow-screen toggle that says how many filters are active and reveals the facets', async () => {
    const w = make({ filters: { ...NO_FILTERS, roles: ['combined'], search: 'gw' }, active: true })
    const toggle = w.findAll('button').find((b) => b.text().startsWith('Filters'))!
    expect(toggle.text()).toBe('Filters (2 active)')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.get('#filter-panel').classes().join(' ')).toMatch(/folded/)
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.get('#filter-panel').classes().join(' ')).not.toMatch(/folded/)
    expect(make().findAll('button').find((b) => b.text().startsWith('Filters'))!.text()).toBe('Filters')
  })
})
