import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import CanvasOverlay from '../src/components/CanvasOverlay.vue'
import { MAX_ZOOM, MIN_ZOOM } from '../src/utils/zoom'

const make = (legendOpen: boolean, panned = false, zoom = 1) =>
  mount(CanvasOverlay, {
    props: { legendOpen, panned, zoom },
    slots: { legend: () => h('p', 'legend body'), scale: () => h('p', 'scale body'), notices: () => h('p', 'notice body') },
  })

describe('CanvasOverlay', () => {
  it('names the legend toggle by its state and exposes it to assistive tech', () => {
    const closed = make(false).findAll('button').find((b) => b.text() === 'Show legend')!
    expect(closed.text()).toBe('Show legend')
    expect(closed.attributes('aria-expanded')).toBe('false')
    expect(closed.attributes('aria-controls')).toBe('legend-panel')
    const open = make(true).findAll('button').find((b) => b.text() === 'Hide legend')!
    expect(open.text()).toBe('Hide legend')
    expect(open.attributes('aria-expanded')).toBe('true')
  })

  it('shows the legend only while open, keeping it in the page', () => {
    expect((make(false).get('#legend-panel').element as HTMLElement).style.display).toBe('none')
    expect((make(true).get('#legend-panel').element as HTMLElement).style.display).toBe('')
  })

  it('asks to toggle', async () => {
    const w = make(false)
    await w.findAll('button').find((b) => b.text() === 'Show legend')!.trigger('click')
    expect(w.emitted('toggleLegend')).toHaveLength(1)
  })

  it('always shows the scale and notices', () => {
    const w = make(false)
    expect(w.text()).toContain('scale body')
    expect(w.text()).toContain('notice body')
  })

  const buttons = (w: ReturnType<typeof make>) => w.findAll('button').map((b) => b.text())
  const zoomIn = (w: ReturnType<typeof make>) => w.get('button[aria-label="Zoom in"]')
  const zoomOut = (w: ReturnType<typeof make>) => w.get('button[aria-label="Zoom out"]')

  it('offers Reset view only while panned or zoomed, and asks to reset', async () => {
    expect(buttons(make(false))).not.toContain('Reset view')
    expect(buttons(make(false, true))).toContain('Reset view')
    expect(buttons(make(false, false, 1.25))).toContain('Reset view')
    expect(buttons(make(false, false, 0.5))).toContain('Reset view')
    const w = make(false, false, 2)
    await w.findAll('button').find((b) => b.text() === 'Reset view')!.trigger('click')
    expect(w.emitted('resetView')).toHaveLength(1)
  })

  it('has zoom buttons named for assistive tech that ask to zoom', async () => {
    const w = make(false)
    expect(zoomIn(w).text()).toBe('+')
    expect(zoomOut(w).text()).toBe('−')
    await zoomIn(w).trigger('click')
    await zoomOut(w).trigger('click')
    expect(w.emitted('zoomIn')).toHaveLength(1)
    expect(w.emitted('zoomOut')).toHaveLength(1)
  })

  it('shows the zoom as a percentage of the fitted size in a status region', () => {
    for (const [zoom, text] of [[1, 'Zoom 100%'], [1.5, 'Zoom 150%'], [0.25, 'Zoom 25%'], [12, 'Zoom 1200%']] as const) {
      const status = make(false, false, zoom).get('[role="status"]')
      expect(status.text()).toBe(text)
    }
  })

  it('disables zoom out at the minimum and zoom in at the maximum, and neither in between', async () => {
    const min = make(false, false, MIN_ZOOM)
    expect(zoomOut(min).attributes('disabled')).toBeDefined()
    expect(zoomIn(min).attributes('disabled')).toBeUndefined()
    const max = make(false, false, MAX_ZOOM)
    expect(zoomIn(max).attributes('disabled')).toBeDefined()
    expect(zoomOut(max).attributes('disabled')).toBeUndefined()
    const mid = make(false)
    expect(zoomIn(mid).attributes('disabled')).toBeUndefined()
    expect(zoomOut(mid).attributes('disabled')).toBeUndefined()
    await zoomIn(max).trigger('click')
    expect(max.emitted('zoomIn')).toBeUndefined()
  })
})
