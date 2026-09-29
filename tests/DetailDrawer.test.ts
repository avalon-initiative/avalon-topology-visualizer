import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DetailDrawer from '../src/components/DetailDrawer.vue'
import type { Alert } from '../src/utils/alerts'

const alert: Alert = { id: 'e1', kind: 'stale', url: 'http://a', title: 'Reports itself stale', detail: 'behind' }
const props = (extra: Record<string, unknown> = {}) => ({
  open: true,
  title: 'http://a',
  rows: [{ label: 'Status', value: 'visited' }],
  alerts: [] as Alert[],
  reduced: false,
  canFirst: true,
  canSecond: true,
  ...extra,
})
const buttons = (w: ReturnType<typeof mount>) => Object.fromEntries(w.findAll('button').map((b) => [b.text(), b]))

describe('DetailDrawer', () => {
  it('renders nothing while closed', () => {
    expect(mount(DetailDrawer, { props: props({ open: false }) }).find('[data-testid="detail-drawer"]').exists()).toBe(false)
  })

  it('is a labelled landmark showing the node title and rows', () => {
    const w = mount(DetailDrawer, { props: props() })
    const drawer = w.get('[data-testid="detail-drawer"]')
    expect(drawer.attributes('role')).toBe('complementary')
    expect(drawer.attributes('aria-label')).toBe('Node details')
    expect(drawer.text()).toContain('http://a')
    expect(drawer.text()).toContain('visited')
    expect(w.get('[aria-label="Selected node"]').text()).toContain('http://a')
  })

  it('has a labelled close button that asks to close', async () => {
    const w = mount(DetailDrawer, { props: props() })
    const close = w.get('button[aria-label="Close node details"]')
    await close.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('offers quick actions that emit', async () => {
    const w = mount(DetailDrawer, { props: props() })
    const b = buttons(w)
    await b['Trace to this node'].trigger('click')
    await b['Use as probe first'].trigger('click')
    await b['Use as probe second'].trigger('click')
    expect(w.emitted('trace')).toHaveLength(1)
    expect(w.emitted('probeFirst')).toHaveLength(1)
    expect(w.emitted('probeSecond')).toHaveLength(1)
  })

  it('disables a probe pick that is not allowed', () => {
    const w = mount(DetailDrawer, { props: props({ canFirst: false }) })
    expect(buttons(w)['Use as probe first'].attributes('disabled')).toBeDefined()
    expect(buttons(w)['Use as probe second'].attributes('disabled')).toBeUndefined()
  })

  it("lists the node's alerts only when it has some", () => {
    expect(mount(DetailDrawer, { props: props() }).find('[data-testid="alerts"]').exists()).toBe(false)
    const w = mount(DetailDrawer, { props: props({ alerts: [alert] }) })
    expect(w.get('[data-testid="alerts"]').text()).toContain('Reports itself stale')
  })

  it('moves focus into the drawer when it opens', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const w = mount(DetailDrawer, { props: props({ open: false }), attachTo: host })
    await w.setProps({ open: true })
    await new Promise((r) => setTimeout(r))
    expect(document.activeElement).toBe(w.get('[data-testid="detail-drawer"]').element)
    w.unmount()
    host.remove()
  })
})
