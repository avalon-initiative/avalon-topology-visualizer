import { describe, expect, it } from 'vitest'
import { activeFilterCount, facetOptions, FACETS, filterChips, setFacet, withoutChip } from '../src/utils/filterChips'
import { NO_FILTERS } from '../src/utils/filters'
import type { Filters } from '../src/utils/filters'

const shard = 'node:' + '07ea'.repeat(15) + '071d'
const f = (over: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...over })

describe('facetOptions', () => {
  it('keeps a short value as it is, without a tooltip', () => {
    expect(facetOptions(['gateway'])).toEqual([{ value: 'gateway', label: 'gateway' }])
  })

  it('shortens a long value for the label and keeps the full value as the tooltip', () => {
    const [option] = facetOptions([shard])
    expect(option.value).toBe(shard)
    expect(option.label).toContain('…')
    expect(option.label.length).toBeLessThan(shard.length)
    expect(option.title).toBe(shard)
  })
})

describe('setFacet', () => {
  it('replaces one facet and leaves the others and the search alone', () => {
    const next = setFacet(f({ roles: ['a'], versions: ['1'], search: 'x' }), 'roles', ['b', 'c'])
    expect(next).toEqual(f({ roles: ['b', 'c'], versions: ['1'], search: 'x' }))
  })

  it('does not alias the array it is given', () => {
    const values = ['a']
    const next = setFacet(NO_FILTERS, 'roles', values)
    values.push('b')
    expect(next.roles).toEqual(['a'])
  })
})

describe('filterChips', () => {
  it('has no chips without filters, and ignores a blank search', () => {
    expect(filterChips(NO_FILTERS)).toEqual([])
    expect(filterChips(f({ search: '   ' }))).toEqual([])
  })

  it('makes one chip per value across facets in facet order, then the search', () => {
    const chips = filterChips(f({ shards: [shard], roles: ['combined', 'gateway'], networkIds: ['net'], versions: ['0.1.0'], search: 'gw' }))
    expect(chips.map((c) => c.label)).toEqual(['Role: combined', 'Role: gateway', 'Network: net', 'Version: 0.1.0', `Shard: ${chips[4].label.slice('Shard: '.length)}`, 'URL: gw'])
    expect(chips.map((c) => c.id)).toEqual(['roles:combined', 'roles:gateway', 'networkIds:net', 'versions:0.1.0', `shards:${shard}`, 'search'])
  })

  it('shortens a shard id in the label and keeps the full one as the title', () => {
    const [chip] = filterChips(f({ shards: [shard] }))
    expect(chip.label.startsWith('Shard: node:')).toBe(true)
    expect(chip.label).toContain('…')
    expect(chip.title).toBe(`Shard: ${shard}`)
    expect(filterChips(f({ roles: ['gateway'] }))[0].title).toBeUndefined()
  })

  it('names the four facets as the bar shows them', () => {
    expect(FACETS.map((x) => x.label)).toEqual(['Role', 'Network', 'Version', 'Shard'])
  })
})

describe('withoutChip', () => {
  const filters = f({ roles: ['a', 'b'], shards: [shard], search: 'gw' })
  const chip = (id: string) => filterChips(filters).find((c) => c.id === id)!

  it('removes only the value of that chip', () => {
    expect(withoutChip(filters, chip('roles:a'))).toEqual(f({ roles: ['b'], shards: [shard], search: 'gw' }))
    expect(withoutChip(filters, chip(`shards:${shard}`))).toEqual(f({ roles: ['a', 'b'], search: 'gw' }))
  })

  it('clears the search for the search chip and nothing else', () => {
    expect(withoutChip(filters, chip('search'))).toEqual(f({ roles: ['a', 'b'], shards: [shard] }))
  })

  it('leaves the filters as they are when the value is already gone', () => {
    expect(withoutChip(f({ roles: ['b'] }), chip('roles:a'))).toEqual(f({ roles: ['b'] }))
  })
})

describe('activeFilterCount', () => {
  it('counts every value and the search text', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(activeFilterCount(f({ roles: ['a', 'b'], versions: ['1'], search: 'x' }))).toBe(4)
  })
})
