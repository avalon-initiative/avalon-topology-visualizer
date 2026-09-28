import type { LayoutLink } from './layout'

export const VIEWER_ID = 'viewer:this-browser'
export const VIEWER_LABEL = 'You (viewer-observed)'
export const DEFAULT_WINDOW = 20
export const DEFAULT_ALPHA = 0.3

/** Outcomes per node URL, oldest first: a round trip in ms, or null for a loss. Bounded by the window. */
export type RttBook = Record<string, (number | null)[]>

export interface RttSummary {
  url: string
  /** Successful samples in the window. */
  count: number
  /** Failed or timed-out attempts in the window. */
  failures: number
  /** failures / attempts in the window; 0 before any attempt. */
  lossRatio: number
  minMs: number | null
  /** EWMA over the successes in the window. */
  smoothedMs: number | null
  /** Most recent successful round trip. */
  lastMs: number | null
}

export interface RttRanking {
  fastest: string | null
  /** Null with fewer than two reachable nodes, so a lone node is not called both fastest and slowest. */
  slowest: string | null
}

/** Adds one outcome, dropping the oldest beyond the window. A non-finite or negative time counts as a loss. */
export function recordOutcome(book: RttBook, url: string, rttMs: number | null, window = DEFAULT_WINDOW): RttBook {
  const outcome = rttMs !== null && Number.isFinite(rttMs) && rttMs >= 0 ? rttMs : null
  const next = [...(book[url] ?? []), outcome]
  return { ...book, [url]: next.slice(-Math.max(1, window)) }
}

/** Forgets nodes that are no longer in the graph so memory follows the graph, not history. */
export function pruneBook(book: RttBook, urls: readonly string[]): RttBook {
  const keep = new Set(urls)
  return Object.fromEntries(Object.entries(book).filter(([url]) => keep.has(url)))
}

export function summarize(url: string, outcomes: readonly (number | null)[] = [], alpha = DEFAULT_ALPHA): RttSummary {
  const ok = outcomes.filter((o): o is number => o !== null)
  const failures = outcomes.length - ok.length
  let smoothed: number | null = null
  for (const v of ok) smoothed = smoothed === null ? v : alpha * v + (1 - alpha) * smoothed
  return {
    url,
    count: ok.length,
    failures,
    lossRatio: outcomes.length === 0 ? 0 : failures / outcomes.length,
    minMs: ok.length ? Math.min(...ok) : null,
    smoothedMs: smoothed,
    lastMs: ok.length ? ok[ok.length - 1] : null,
  }
}

/** One summary per URL given, in that order, including nodes with no attempt yet. */
export function summarizeBook(book: RttBook, urls: readonly string[], alpha = DEFAULT_ALPHA): RttSummary[] {
  return urls.map((url) => summarize(url, book[url], alpha))
}

export function rankReachable(summaries: readonly RttSummary[]): RttRanking {
  const reachable = summaries.filter((s) => s.smoothedMs !== null)
  if (reachable.length === 0) return { fastest: null, slowest: null }
  let fastest = reachable[0]
  let slowest = reachable[0]
  for (const s of reachable) {
    if ((s.smoothedMs as number) < (fastest.smoothedMs as number)) fastest = s
    if ((s.smoothedMs as number) > (slowest.smoothedMs as number)) slowest = s
  }
  return { fastest: fastest.url, slowest: reachable.length > 1 ? slowest.url : null }
}

/** Links from the viewer to every node with at least one success; total loss gets no link. */
export function viewerLinks(summaries: readonly RttSummary[]): LayoutLink[] {
  return summaries.flatMap((s) => (s.smoothedMs === null ? [] : [{ a: VIEWER_ID, b: s.url, rttMs: s.smoothedMs }]))
}
