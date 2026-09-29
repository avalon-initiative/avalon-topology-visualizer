import { describe, expect, it } from 'vitest'
import { useTabs } from '../src/composables/useTabs'
import { tabAfterKey } from '../src/utils/tabs'

const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c', disabled: true }, { id: 'd' }]

describe('tabAfterKey', () => {
  it('moves right and left, wrapping, and skips disabled tabs', () => {
    expect(tabAfterKey(tabs, 'a', 'ArrowRight')).toBe('b')
    expect(tabAfterKey(tabs, 'b', 'ArrowRight')).toBe('d')
    expect(tabAfterKey(tabs, 'd', 'ArrowRight')).toBe('a')
    expect(tabAfterKey(tabs, 'a', 'ArrowLeft')).toBe('d')
    expect(tabAfterKey(tabs, 'd', 'ArrowLeft')).toBe('b')
  })

  it('jumps to the first and last enabled tab', () => {
    expect(tabAfterKey(tabs, 'b', 'Home')).toBe('a')
    expect(tabAfterKey(tabs, 'b', 'End')).toBe('d')
  })

  it('ignores other keys and unknown tabs', () => {
    expect(tabAfterKey(tabs, 'a', 'Enter')).toBeUndefined()
    expect(tabAfterKey(tabs, 'zzz', 'ArrowRight')).toBeUndefined()
  })
})

describe('useTabs', () => {
  it('holds the active tab', () => {
    const t = useTabs<'a' | 'b'>('a')
    expect(t.active.value).toBe('a')
    t.select('b')
    expect(t.active.value).toBe('b')
  })
})
