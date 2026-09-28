export const STATUS_PATH = '/nodes/status'
export const DEFAULT_INTERVAL_MS = 10_000
export const DEFAULT_TIMEOUT_MS = 5_000
export const DEFAULT_CONCURRENCY = 4
export const MAX_BACKOFF_MS = 300_000
const MAX_RETRY_AFTER_MS = 600_000

export interface RttSample {
  url: string
  /** Round trip to the response headers; null is a loss. */
  rttMs: number | null
  reason?: 'timeout' | 'network' | 'http' | 'rate_limited'
  retryAfterMs?: number
}

export interface ProberOptions {
  /** Current node URLs to measure; read at the start of every round. */
  urls: () => string[]
  onSample: (sample: RttSample) => void
  /** Called once every round, after its samples. */
  onRound?: () => void
  fetchFn?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  concurrency?: number
  maxBackoffMs?: number
  clock?: () => number
}

export interface Prober {
  start(): void
  stop(): void
  readonly running: boolean
}

interface Backoff {
  failures: number
  notBefore: number
}

function statusUrl(base: string): string | null {
  try {
    const u = new URL(base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return `${u.origin}${STATUS_PATH}`
  } catch {
    return null
  }
}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : 0
}

/** Times a public GET to each node's status route on an interval. Read-only, no credentials. */
export function createProber(options: ProberOptions): Prober {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS
  const clock = options.clock ?? Date.now
  const backoff = new Map<string, Backoff>()

  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let epoch = 0

  async function probe(url: string, signal: AbortSignal): Promise<RttSample | null> {
    const target = statusUrl(url)
    const fail = (reason: RttSample['reason'], extra: Partial<RttSample> = {}): RttSample => ({ url, rttMs: null, reason, ...extra })
    if (!target) return fail('network')

    const attempt = new AbortController()
    let timedOut = false
    const onStop = () => attempt.abort()
    signal.addEventListener('abort', onStop)
    const timeout = setTimeout(() => {
      timedOut = true
      attempt.abort()
    }, timeoutMs)
    const t0 = performance.now()
    try {
      const res = await fetchFn(target, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: attempt.signal })
      const rttMs = performance.now() - t0
      void res.body?.cancel().catch(() => undefined)
      if (res.status === 429) return fail('rate_limited', { retryAfterMs: retryAfterMs(res) })
      if (!res.ok) return fail('http')
      backoff.delete(url)
      return { url, rttMs }
    } catch {
      if (signal.aborted) return null
      return fail(timedOut ? 'timeout' : 'network')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onStop)
    }
  }

  function noteFailure(sample: RttSample, at: number) {
    const failures = (backoff.get(sample.url)?.failures ?? 0) + 1
    const delay =
      sample.reason === 'rate_limited'
        ? Math.max(intervalMs, sample.retryAfterMs ?? 0)
        : Math.min(intervalMs * 2 ** (failures - 1), maxBackoffMs)
    backoff.set(sample.url, { failures, notBefore: at + delay })
  }

  async function round(mine: number, signal: AbortSignal) {
    const now = clock()
    const urls = [...new Set(options.urls())]
    for (const url of backoff.keys()) if (!urls.includes(url)) backoff.delete(url)
    const queue = urls.filter((url) => now >= (backoff.get(url)?.notBefore ?? 0))

    async function worker() {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        const at = clock()
        const sample = await probe(url, signal)
        if (!sample || mine !== epoch) return
        if (sample.rttMs === null) noteFailure(sample, at)
        options.onSample(sample)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
    if (mine === epoch) options.onRound?.()
  }

  async function loop(mine: number, signal: AbortSignal) {
    await round(mine, signal)
    if (mine === epoch) timer = setTimeout(() => void loop(mine, signal), intervalMs)
  }

  return {
    get running() {
      return running
    },
    start() {
      if (running) return
      running = true
      const mine = ++epoch
      controller = new AbortController()
      void loop(mine, controller.signal)
    },
    stop() {
      running = false
      epoch++
      clearTimeout(timer)
      timer = undefined
      controller?.abort()
      controller = null
    },
  }
}
