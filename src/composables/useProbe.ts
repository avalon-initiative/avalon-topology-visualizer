import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { probePair } from '../api/prober'
import type { PairProbeOptions } from '../api/prober'
import { liveProbes, probeDrawLinks, probeLayoutLinks, recordProbe } from '../utils/probeBook'
import type { ProbeBook } from '../utils/probeBook'
import { describeProbeFailure } from '../utils/probeOutcome'
import type { ProbeFailure, ProbeOutcome, ProbeSuccess } from '../utils/probeOutcome'
import { pickRandomPair } from '../utils/randomPair'
import type { MergedGraph } from '../utils/mergeGraph'

export interface ProbeOptions extends PairProbeOptions {
  rng?: () => number
  clock?: () => number
}

/** Ask one selected node to probe another selected node; the results feed the layout and the drawn links. */
export function useProbe(merged: Ref<MergedGraph | null>, selected: () => string | undefined, options: ProbeOptions = {}) {
  const clock = options.clock ?? Date.now
  const from = ref<string | undefined>()
  const to = ref<string | undefined>()
  const busy = ref(false)
  const book = shallowRef<ProbeBook>({})
  const last = shallowRef<ProbeOutcome | null>(null)
  const now = ref(clock())
  // A node that rate limited us is left alone until this time (ms), per node.
  const coolUntil = shallowRef<Record<string, number>>({})
  let ticker: ReturnType<typeof setInterval> | undefined
  let epoch = 0

  const urls = () => merged.value?.nodes.map((n) => n.url) ?? []

  function retryIn(url: string | undefined): number {
    const until = url === undefined ? undefined : coolUntil.value[url]
    return until === undefined ? 0 : Math.max(0, Math.ceil((until - now.value) / 1000))
  }
  const cooldown = computed(() => retryIn(from.value))
  const coolingNodes = computed(() => new Set(Object.keys(coolUntil.value).filter((u) => retryIn(u) > 0)))

  function stopTicker() {
    clearInterval(ticker)
    ticker = undefined
  }
  function startTicker() {
    if (ticker) return
    ticker = setInterval(() => {
      now.value = clock()
      if (coolingNodes.value.size === 0) stopTicker()
    }, 1000)
  }
  onScopeDispose(stopTicker)

  const probes = computed<ProbeSuccess[]>(() => liveProbes(book.value, urls()))
  const links = computed(() => probeLayoutLinks(probes.value))
  const drawLinks = computed(() => probeDrawLinks(probes.value))
  const message = computed(() => (last.value && !last.value.ok ? describeProbeFailure(last.value) : ''))
  const canProbe = computed(() => !!from.value && !!to.value && from.value !== to.value && !busy.value && cooldown.value === 0)

  function pickFirst() {
    const s = selected()
    if (!s) return
    from.value = s
    if (to.value === s) to.value = undefined
  }
  function pickSecond() {
    const s = selected()
    if (!s) return
    to.value = s
    if (from.value === s) from.value = undefined
  }

  function noteFailure(f: ProbeFailure) {
    if (f.kind !== 'rate_limited') return
    now.value = clock()
    // Without a Retry-After the node still gets a short pause so the button cannot be hammered.
    coolUntil.value = { ...coolUntil.value, [f.from]: now.value + (f.retryAfterSeconds ?? 5) * 1000 }
    startTicker()
  }

  async function run(a: string, b: string) {
    busy.value = true
    const mine = ++epoch
    const outcome = await probePair(a, b, options)
    if (mine !== epoch) return
    busy.value = false
    last.value = outcome
    if (outcome.ok) book.value = recordProbe(book.value, outcome)
    else noteFailure(outcome)
  }

  function measure() {
    if (canProbe.value) return run(from.value!, to.value!)
  }

  function measureRandom() {
    if (!merged.value || busy.value) return
    const pair = pickRandomPair(merged.value, options.rng, coolingNodes.value)
    if (!pair) return
    from.value = pair.from
    to.value = pair.to
    return run(pair.from, pair.to)
  }

  const canRandom = computed(() => !busy.value && !!merged.value && pickRandomPair(merged.value, () => 0, coolingNodes.value) !== undefined)

  // A refresh or a new snapshot can drop a picked node; an outcome for a dropped node no longer applies.
  watch(merged, (m) => {
    const has = (u: string | undefined) => !!u && !!m?.nodes.some((n) => n.url === u)
    if (!has(from.value)) from.value = undefined
    if (!has(to.value)) to.value = undefined
    if (last.value && (!has(last.value.from) || !has(last.value.to))) last.value = null
    if (!m) {
      epoch++
      busy.value = false
    }
  })

  return { from, to, busy, last, message, cooldown, canProbe, canRandom, probes, links, drawLinks, pickFirst, pickSecond, measure, measureRandom }
}
