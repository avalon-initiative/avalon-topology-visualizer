import type { AvalonIssueListItem, AvalonIssueTone } from '@avalon-initiative/common-ui'
import { ALERT_LABELS } from './alerts'
import type { Alert, AlertKind } from './alerts'

export interface NodeIssue {
  url: string
  reason: string
  detail: string
}

const ALERT_TONES: Record<AlertKind, AvalonIssueTone> = { equivocation: 'danger', stale: 'warning' }

/** An alert as an issue row: its kind in words as the badge, the node URL first, then what happened. */
export function alertIssues(alerts: Alert[]): AvalonIssueListItem[] {
  return alerts.map((a) => ({ id: a.id, badge: ALERT_LABELS[a.kind], tone: ALERT_TONES[a.kind], primary: a.url, secondary: `${a.title}. ${a.detail}` }))
}

/** A node that could not be read as an issue row; the URL is the id and the failure detail is the tooltip. */
export function nodeIssues(items: NodeIssue[], tone: AvalonIssueTone): AvalonIssueListItem[] {
  return items.map((i) => ({ id: i.url, badge: i.reason, tone, primary: i.url, title: i.detail }))
}

/** The node URL an alert row stands for, or undefined when the id is not (or no longer) an alert. */
export function alertUrl(alerts: Alert[], id: string): string | undefined {
  return alerts.find((a) => a.id === id)?.url
}
