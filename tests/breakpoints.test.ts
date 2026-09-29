import { describe, expect, it } from 'vitest'
import { isWideViewport, SIDE_PANEL_MIN_PX } from '../src/utils/breakpoints'

describe('isWideViewport', () => {
  it('asks for the side-panel minimum width', () => {
    let asked = ''
    isWideViewport((q) => {
      asked = q
      return { matches: true }
    })
    expect(asked).toBe(`(min-width: ${SIDE_PANEL_MIN_PX}px)`)
  })

  it('follows the match result', () => {
    expect(isWideViewport(() => ({ matches: true }))).toBe(true)
    expect(isWideViewport(() => ({ matches: false }))).toBe(false)
  })

  it('counts as wide where matchMedia does not exist', () => {
    expect(isWideViewport(() => undefined)).toBe(true)
  })
})
