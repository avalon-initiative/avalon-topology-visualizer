import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import ToolSidebar from '../src/components/ToolSidebar.vue'

const tabs = [
  { id: 'one', label: 'One', badge: '3' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three', disabled: true },
]
const make = (active = 'one') =>
  mount(ToolSidebar, {
    props: { tabs, modelValue: active, 'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }) },
    slots: { one: () => h('p', 'first body'), two: () => h('p', 'second body'), three: () => h('p', 'third body') },
    attachTo: document.body,
  })
let w: ReturnType<typeof make>

describe('ToolSidebar', () => {
  it('renders a tab list with one tab per section and marks the selected one', () => {
    w = make()
    const list = w.get('[role="tablist"]')
    expect(list.findAll('[role="tab"]').map((t) => t.text())).toEqual(['One3', 'Two', 'Three'])
    const [one, two] = w.findAll('[role="tab"]')
    expect(one.attributes('aria-selected')).toBe('true')
    expect(two.attributes('aria-selected')).toBe('false')
    expect(one.attributes('tabindex')).toBe('0')
    expect(two.attributes('tabindex')).toBe('-1')
    w.unmount()
  })

  it('shows only the selected section, wired to its tab', () => {
    w = make()
    const panels = w.findAll('[role="tabpanel"]')
    expect(panels.map((p) => (p.element as HTMLElement).style.display)).toEqual(['', 'none', 'none'])
    expect(panels[0].attributes('aria-labelledby')).toBe(w.findAll('[role="tab"]')[0].attributes('id'))
    expect(panels[0].text()).toBe('first body')
    w.unmount()
  })

  it('switches on click but not onto a disabled tab', async () => {
    w = make()
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['two'])
    expect(w.findAll('[role="tab"]')[2].attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('moves with the arrow keys, skipping disabled tabs, and focuses the new tab', async () => {
    w = make()
    await w.findAll('[role="tab"]')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['two'])
    expect(document.activeElement?.id).toBe(w.findAll('[role="tab"]')[1].attributes('id'))
    await w.findAll('[role="tab"]')[1].trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['one'])
    w.unmount()
  })

  it('asks to close from the sheet close button', async () => {
    w = make()
    await w.get('button:not([role="tab"])').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})
