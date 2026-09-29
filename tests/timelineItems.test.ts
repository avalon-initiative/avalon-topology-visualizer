import { describe, expect, it } from 'vitest'
import { markerTone, timelineItems } from '../src/utils/timelineItems'
import type { MarkerLike } from '../src/utils/timelineItems'

const marker = (index: number, joined = 0, departed = 0, versionChanges = 0): MarkerLike => ({
  index,
  takenAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  label: [joined && `+${joined}`, departed && `-${departed}`, versionChanges && `~${versionChanges}`].filter(Boolean).join(' '),
  joined,
  departed,
  versionChanges,
})

describe('markerTone', () => {
  it('picks the colour from what changed', () => {
    expect(markerTone(marker(1, 1))).toBe('success')
    expect(markerTone(marker(1, 0, 1))).toBe('danger')
    expect(markerTone(marker(1, 0, 0, 1))).toBe('warning')
    expect(markerTone(marker(1))).toBe('neutral')
  })
})

describe('timelineItems', () => {
  const items = timelineItems([marker(0), marker(1, 2), marker(2, 0, 1, 1), marker(3)])

  it('keys each card by its marker index', () => {
    expect(items.map((i) => i.id)).toEqual(['0', '1', '2', '3'])
  })

  it('words the change: the label, else "first" for the first snapshot, else "no change"', () => {
    expect(items.map((i) => i.note)).toEqual(['first', '+2', '-1 ~1', 'no change'])
  })

  it('tags only the last card as latest', () => {
    expect(items.map((i) => i.tag)).toEqual([undefined, undefined, undefined, 'latest'])
  })

  it('carries the tone and the clock time', () => {
    expect(items.map((i) => i.tone)).toEqual(['neutral', 'success', 'danger', 'neutral'])
    expect(items[0].subtitle).toBe(new Date(marker(0).takenAt).toLocaleTimeString())
  })

  it('names the snapshot and, when it changed, the counts for assistive tech', () => {
    expect(items[0].ariaLabel).toBe(`Snapshot 1, ${new Date(marker(0).takenAt).toLocaleString()}`)
    expect(items[2].ariaLabel).toContain('Snapshot 3')
    expect(items[2].ariaLabel).toContain('0 joined, 1 departed, 1 version changes')
    expect(items[1].title).toContain('(+2)')
  })

  it('is empty without markers', () => {
    expect(timelineItems([])).toEqual([])
  })
})
