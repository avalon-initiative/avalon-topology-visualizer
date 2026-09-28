import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScaleBar from '../src/components/ScaleBar.vue'

describe('ScaleBar', () => {
  it('labels the bar in milliseconds and sizes it in pixels', () => {
    const wrapper = mount(ScaleBar, { props: { px: 80, ms: 20 } })
    expect(wrapper.text()).toContain('20 ms round trip')
    expect(wrapper.find('span').attributes('style')).toContain('width: 80px')
  })

  it('renders nothing when there is no scale', () => {
    expect(mount(ScaleBar, { props: { px: 0, ms: 0 } }).find('[data-testid="scale-bar"]').exists()).toBe(false)
  })
})
