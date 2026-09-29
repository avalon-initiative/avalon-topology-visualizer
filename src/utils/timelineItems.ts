import type { AvalonTimelineItem, AvalonTimelineTone } from '@avalon-initiative/common-ui'

export interface MarkerLike {
  index: number
  takenAt: string
  label: string
  joined: number
  departed: number
  versionChanges: number
}

const when = (iso: string) => new Date(iso).toLocaleString()
const clock = (iso: string) => new Date(iso).toLocaleTimeString()

/** The card colour for a snapshot: joins first, then departures, then version changes; the note carries the same in words. */
export function markerTone(m: MarkerLike): AvalonTimelineTone {
  if (m.joined > 0) return 'success'
  if (m.departed > 0) return 'danger'
  if (m.versionChanges > 0) return 'warning'
  return 'neutral'
}

/** The time-lapse markers as timeline cards; the card id is the marker index as text. */
export function timelineItems(markers: MarkerLike[]): AvalonTimelineItem[] {
  const last = markers.length - 1
  return markers.map((m, i) => ({
    id: String(m.index),
    subtitle: clock(m.takenAt),
    note: m.label || (m.index === 0 ? 'first' : 'no change'),
    ...(i === last ? { tag: 'latest' } : {}),
    tone: markerTone(m),
    title: `${when(m.takenAt)}${m.label ? ` (${m.label})` : ''}`,
    ariaLabel: `Snapshot ${m.index + 1}, ${when(m.takenAt)}${m.label ? `, ${m.joined} joined, ${m.departed} departed, ${m.versionChanges} version changes` : ''}`,
  }))
}
