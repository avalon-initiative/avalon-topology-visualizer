import { describe, expect, it } from 'vitest'
import { easeInOut, interpolatePositions } from '../src/utils/tween'

describe('interpolatePositions', () => {
  const from = { a: { x: 0, y: 0 }, gone: { x: 5, y: 5 } }
  const to = { a: { x: 100, y: 50 }, fresh: { x: 7, y: 7 } }

  it('is the start at 0 and the end at 1', () => {
    expect(interpolatePositions(from, to, 0).a).toEqual({ x: 0, y: 0 })
    expect(interpolatePositions(from, to, 1).a).toEqual({ x: 100, y: 50 })
  })

  it('is halfway at 0.5 (the easing is symmetric)', () => {
    expect(interpolatePositions(from, to, 0.5).a).toEqual({ x: 50, y: 25 })
  })

  it('places new nodes at their final position and drops departed ones', () => {
    const mid = interpolatePositions(from, to, 0.3)
    expect(mid.fresh).toEqual({ x: 7, y: 7 })
    expect(mid).not.toHaveProperty('gone')
  })

  it('clamps out-of-range time and handles empty input', () => {
    expect(interpolatePositions(from, to, -1).a).toEqual({ x: 0, y: 0 })
    expect(interpolatePositions(from, to, 9).a).toEqual({ x: 100, y: 50 })
    expect(interpolatePositions({}, {}, 0.5)).toEqual({})
  })

  it('eases monotonically', () => {
    let last = -1
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeInOut(t)).toBeGreaterThanOrEqual(last)
      last = easeInOut(t)
    }
  })
})
