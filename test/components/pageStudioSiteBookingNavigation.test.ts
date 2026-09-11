// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import Workspace from '~~/app/components/page-studio/SiteWorkspace.vue'

Object.assign(globalThis, {
  computed, reactive, ref,
  useRuntimeConfig: () => ({ public: {} }),
  useToast: () => ({ add: vi.fn() }),
  usePageStudioLauncher: () => ({ launchPageStudio: vi.fn() })
})
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UCard: { template: '<article><slot /></article>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<span />' },
  UAlert: { template: '<div />' },
  UModal: { template: '<div />' },
  UButton: {
    props: ['label', 'to'],
    setup: (props: { label: string, to?: string | { path: string, query: Record<string, string> } }) => () => h('a', {
      href: typeof props.to === 'string' ? props.to : props.to ? `${props.to.path}?${new URLSearchParams(props.to.query)}` : undefined
    }, props.label)
  }
}
function mount(audience: 'agency' | 'portal') {
  const site = reactive({ id: 'site-a', name: 'Trips', clientId: 'client-a', route: 'trips', starterVersion: 'limousine-v1', status: 'draft', createdAt: '', updatedAt: '', bookingEnabled: true })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Workspace, { audience, sites: [site, { ...site, id: 'site-b', name: 'Shop', bookingEnabled: false }], total: 2, page: 1, pageSize: 25 }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  return { site, host }
}
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})
describe('website booking links', () => {
  it.each(['agency', 'portal'] as const)('opens the entitled website on the %s booking screen', (audience) => {
    const { host } = mount(audience)
    const links = [...host.querySelectorAll('a')].filter(link => link.textContent === 'Bookings')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe(`/${audience}/page-studio/bookings?siteId=site-a`)
  })
  it('removes a link when refreshed entitlement no longer allows bookings', async () => {
    const { host, site } = mount('portal')
    site.bookingEnabled = false
    await nextTick()
    expect([...host.querySelectorAll('a')].some(link => link.textContent === 'Bookings')).toBe(false)
  })
})
