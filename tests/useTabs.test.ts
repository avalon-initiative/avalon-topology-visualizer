import { describe, expect, it } from 'vitest'
import { useTabs } from '../src/composables/useTabs'

describe('useTabs', () => {
  it('holds the active tab', () => {
    const t = useTabs<'a' | 'b'>('a')
    expect(t.active.value).toBe('a')
    t.select('b')
    expect(t.active.value).toBe('b')
  })
})
