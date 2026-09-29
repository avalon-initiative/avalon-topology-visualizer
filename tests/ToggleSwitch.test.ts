import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToggleSwitch from '../src/components/ToggleSwitch.vue'

const sw = (props: Partial<{ modelValue: boolean; label: string; description: string }> = {}) =>
  mount(ToggleSwitch, { props: { modelValue: false, label: 'Hide things', ...props } })

describe('ToggleSwitch', () => {
  it('is a labelled switch and reflects the value', () => {
    const w = sw({ modelValue: true })
    const input = w.get('input')
    expect(input.attributes('role')).toBe('switch')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(w.text()).toContain('Hide things')
  })

  it('says On or Off in words, not by position or colour alone', () => {
    expect(sw({ modelValue: true }).get('[data-testid="switch-state"]').text()).toBe('On')
    expect(sw({ modelValue: false }).get('[data-testid="switch-state"]').text()).toBe('Off')
  })

  it('emits the new value when flipped either way', async () => {
    const w = sw({ modelValue: false })
    await w.get('input').setValue(true)
    await w.get('input').setValue(false)
    expect(w.emitted('update:modelValue')).toEqual([[true], [false]])
  })

  it('shows the description only when given', () => {
    expect(sw().text()).not.toContain('Off: dimmed')
    expect(sw({ description: 'Off: dimmed' }).text()).toContain('Off: dimmed')
  })
})
