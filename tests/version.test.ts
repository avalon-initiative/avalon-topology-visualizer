import { describe, expect, it } from 'vitest'
import { compareVersions, newestVersion } from '../src/utils/version'

describe('compareVersions', () => {
  it.each([
    ['0.1.4', '0.1.3', 1],
    ['0.1.3', '0.1.4', -1],
    ['0.10.0', '0.9.3', 1],
    ['1.0.0', '1.0.0', 0],
    ['1.0', '1.0.0', 0],
    ['v1.2.0', '1.2.0', 0],
    ['1.0.0-rc1', '1.0.0', -1],
    ['1.0.0', '1.0.0-rc1', 1],
    ['1.0.0-rc1', '1.0.0-rc2', -1],
    ['2.0.0', '1.99.99', 1],
  ])('compares %s with %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected)
  })

  it('treats non-numeric parts as zero rather than throwing', () => {
    expect(compareVersions('x.y.z', '0.0.0')).toBe(0)
  })
})

describe('newestVersion', () => {
  it('picks the highest, numerically', () => {
    expect(newestVersion(['0.9.3', '0.10.0', '0.9.9'])).toBe('0.10.0')
  })

  it('returns undefined for no versions', () => {
    expect(newestVersion([])).toBeUndefined()
  })
})
