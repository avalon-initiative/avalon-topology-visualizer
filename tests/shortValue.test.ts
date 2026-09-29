import { describe, expect, it } from 'vitest'
import { shortValue } from '../src/utils/shortValue'

describe('shortValue', () => {
  it('leaves short values alone', () => {
    expect(shortValue('core')).toBe('core')
    expect(shortValue('a'.repeat(28))).toBe('a'.repeat(28))
  })

  it('shortens a long id to the limit, keeping both ends', () => {
    const id = 'node:' + 'abcdef0123456789'.repeat(4)
    const out = shortValue(id, 20)
    expect(out).toHaveLength(20)
    expect(out.startsWith('node:abcde')).toBe(true)
    expect(out.endsWith(id.slice(-9))).toBe(true)
    expect(out).toContain('…')
  })

  it('does not mangle when the limit is too small to be useful', () => {
    expect(shortValue('abcdefghij', 3)).toBe('abcdefghij')
  })
})
