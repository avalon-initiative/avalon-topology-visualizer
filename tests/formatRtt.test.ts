import { describe, expect, it } from 'vitest'
import { formatLoss, formatMs } from '../src/utils/formatRtt'

describe('formatRtt', () => {
  it('keeps a decimal under 10 ms and rounds above', () => {
    expect(formatMs(8.44)).toBe('8.4 ms')
    expect(formatMs(140.6)).toBe('141 ms')
    expect(formatMs(0)).toBe('0.0 ms')
  })

  it('shows a dash for no measurement', () => {
    expect(formatMs(null)).toBe('—')
  })

  it('rounds loss to a whole percent', () => {
    expect(formatLoss(0)).toBe('0% loss')
    expect(formatLoss(1 / 3)).toBe('33% loss')
    expect(formatLoss(1)).toBe('100% loss')
  })
})
