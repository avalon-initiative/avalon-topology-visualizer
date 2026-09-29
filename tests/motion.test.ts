import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useMotion } from '../src/composables/useMotion'
import { usePulses } from '../src/composables/usePulses'
import type { PulseClock } from '../src/composables/usePulses'
import { reducedMotion, toggledPreference } from '../src/utils/motion'
import { PULSE_DURATION_MS } from '../src/utils/pulses'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { edge, merged, reporting } from './extraGraphs'

describe('reducedMotion', () => {
  it('follows the system until the viewer chooses', () => {
    expect(reducedMotion('system', true)).toBe(true)
    expect(reducedMotion('system', false)).toBe(false)
    expect(reducedMotion('reduce', false)).toBe(true)
    expect(reducedMotion('full', true)).toBe(false)
  })

  it('toggles to the opposite of what is in effect, as an explicit choice', () => {
    expect(toggledPreference('system', true)).toBe('full')
    expect(toggledPreference('system', false)).toBe('reduce')
    expect(toggledPreference('reduce', false)).toBe('full')
    expect(toggledPreference('full', false)).toBe('reduce')
  })
})

function fakeMedia(matches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | undefined
  const list = {
    matches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (listener = cb),
    removeEventListener: () => (listener = undefined),
  } as unknown as MediaQueryList
  return { list, fire: (m: boolean) => listener?.({ matches: m } as MediaQueryListEvent), hasListener: () => listener !== undefined }
}

describe('useMotion', () => {
  it('honours prefers-reduced-motion by default and follows changes to it', () => {
    const media = fakeMedia(true)
    const m = effectScope().run(() => useMotion(() => media.list))!
    expect(m.reduced.value).toBe(true)
    media.fire(false)
    expect(m.reduced.value).toBe(false)
  })

  it('lets a manual choice override the system, in both directions', () => {
    const media = fakeMedia(true)
    const m = effectScope().run(() => useMotion(() => media.list))!
    m.toggle()
    expect(m.reduced.value).toBe(false)
    media.fire(true)
    expect(m.reduced.value).toBe(false)
    m.toggle()
    expect(m.reduced.value).toBe(true)
  })

  it('works when the environment has no matchMedia, and stops listening with its scope', () => {
    const m = effectScope().run(() => useMotion(() => undefined))!
    expect(m.reduced.value).toBe(false)
    const media = fakeMedia(false)
    const scope = effectScope()
    scope.run(() => useMotion(() => media.list))
    expect(media.hasListener()).toBe(true)
    scope.stop()
    expect(media.hasListener()).toBe(false)
  })
})

function clock() {
  let t = 0
  let pending: (() => void) | undefined
  const c: PulseClock = { now: () => t, request: (cb) => ((pending = cb), 1), cancel: () => (pending = undefined) }
  return { c, advance: (ms: number) => { t += ms; const cb = pending; pending = undefined; cb?.() }, waiting: () => pending !== undefined }
}

const before = () => merged([reporting('http://a')])
const after = () => merged([reporting('http://a'), reporting('http://b')], [edge('http://a', 'http://b')])

async function setup(reducedNow: boolean) {
  const k = clock()
  const source = ref<MergedGraph | null>(before())
  const reduced = ref(reducedNow)
  const p = effectScope().run(() => usePulses(source, reduced, k.c))!
  return { k, source, reduced, p }
}

describe('usePulses', () => {
  it('draws nothing on the first graph and while nothing changes', async () => {
    const { source, p } = await setup(false)
    expect(p.drawing.value).toBeUndefined()
    source.value = before()
    await nextTick()
    expect(p.drawing.value).toBeUndefined()
  })

  it('animates a real change once, from start to finish, then stops drawing', async () => {
    const { k, source, p } = await setup(false)
    source.value = after()
    await nextTick()
    expect(p.pulses.value.map((x) => x.kind)).toEqual(['announce'])
    expect(p.drawing.value?.progress).toBe(0)
    k.advance(PULSE_DURATION_MS / 2)
    expect(p.drawing.value?.progress).toBeCloseTo(0.5)
    k.advance(PULSE_DURATION_MS)
    expect(p.drawing.value).toBeUndefined()
    expect(k.waiting()).toBe(false)
  })

  it('with reduced motion shows a static indicator (no progress) and schedules no animation', async () => {
    const { k, source, p } = await setup(true)
    source.value = after()
    await nextTick()
    expect(p.drawing.value?.progress).toBeNull()
    expect(p.drawing.value?.keys.size).toBe(1)
    expect(k.waiting()).toBe(false)
  })

  it('replaces the static indicator with the next refresh, and clears it when that refresh changed nothing', async () => {
    const { source, p } = await setup(true)
    source.value = after()
    await nextTick()
    source.value = after()
    await nextTick()
    expect(p.drawing.value).toBeUndefined()
  })

  it('turning reduced motion on mid-animation cancels it and shows the static marker', async () => {
    const { k, source, reduced, p } = await setup(false)
    source.value = after()
    await nextTick()
    reduced.value = true
    await nextTick()
    expect(k.waiting()).toBe(false)
    expect(p.drawing.value?.progress).toBeNull()
  })

  it('a new change restarts the animation', async () => {
    const { k, source, p } = await setup(false)
    source.value = after()
    await nextTick()
    k.advance(PULSE_DURATION_MS / 2)
    source.value = merged([reporting('http://a'), reporting('http://b'), reporting('http://c')], [edge('http://a', 'http://b'), edge('http://b', 'http://c')])
    await nextTick()
    expect(p.drawing.value?.progress).toBe(0)
  })
})
