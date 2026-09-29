import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import CanvasOverlay from '../src/components/CanvasOverlay.vue'

const make = (legendOpen: boolean, panned = false) =>
  mount(CanvasOverlay, {
    props: { legendOpen, panned },
    slots: { legend: () => h('p', 'legend body'), scale: () => h('p', 'scale body'), notices: () => h('p', 'notice body') },
  })

describe('CanvasOverlay', () => {
  it('names the legend toggle by its state and exposes it to assistive tech', () => {
    const closed = make(false).get('button')
    expect(closed.text()).toBe('Show legend')
    expect(closed.attributes('aria-expanded')).toBe('false')
    expect(closed.attributes('aria-controls')).toBe('legend-panel')
    const open = make(true).get('button')
    expect(open.text()).toBe('Hide legend')
    expect(open.attributes('aria-expanded')).toBe('true')
  })

  it('shows the legend only while open, keeping it in the page', () => {
    expect((make(false).get('#legend-panel').element as HTMLElement).style.display).toBe('none')
    expect((make(true).get('#legend-panel').element as HTMLElement).style.display).toBe('')
  })

  it('asks to toggle', async () => {
    const w = make(false)
    await w.get('button').trigger('click')
    expect(w.emitted('toggleLegend')).toHaveLength(1)
  })

  it('always shows the scale and notices', () => {
    const w = make(false)
    expect(w.text()).toContain('scale body')
    expect(w.text()).toContain('notice body')
  })

  it('offers Reset view only while panned, and asks to reset', async () => {
    expect(make(false).findAll('button').map((b) => b.text())).toEqual(['Show legend'])
    const w = make(false, true)
    const reset = w.findAll('button').find((b) => b.text() === 'Reset view')!
    await reset.trigger('click')
    expect(w.emitted('resetView')).toHaveLength(1)
  })
})
