export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`
}

export function formatLoss(ratio: number): string {
  return `${Math.round(ratio * 100)}% loss`
}
