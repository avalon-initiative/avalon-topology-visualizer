import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeDetailPanel from '../src/components/NodeDetailPanel.vue'

describe('NodeDetailPanel', () => {
  const rows = [
    { label: 'URL', value: 'http://a', mono: true },
    { label: 'Roles', value: 'gateway' },
  ]

  it('shows the node as the title and each row as label and value', () => {
    const wrapper = mount(NodeDetailPanel, { props: { title: 'http://a', rows } })
    expect(wrapper.find('h3').text()).toBe('http://a')
    expect(wrapper.findAll('dt').map((d) => d.text())).toEqual(['URL', 'Roles'])
    expect(wrapper.findAll('dd').map((d) => d.text())).toEqual(['http://a', 'gateway'])
  })

  it('uses the mono style only for rows that ask for it', () => {
    const values = mount(NodeDetailPanel, { props: { title: 't', rows } }).findAll('dd')
    expect(values[0].classes().join(' ')).toMatch(/mono/)
    expect(values[1].classes().join(' ')).not.toMatch(/mono/)
  })

  it('is a labelled region for assistive tech', () => {
    expect(mount(NodeDetailPanel, { props: { title: 't', rows } }).attributes('aria-label')).toBe('Selected node')
  })
})
