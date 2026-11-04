// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense } from 'vue'
import Sites from '~~/app/pages/studio/sites/index.vue'
import Dashboard from '~~/app/pages/studio/dashboard.vue'
import Layout from '~~/app/layouts/studio.vue'

let app: ReturnType<typeof createApp> | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
async function mount(component: typeof Sites, view: unknown = 'templates', dirty = false) {
  const route = reactive({ query: { view } })
  Object.entries({ computed, ref }).forEach(([key, value]) => vi.stubGlobal(key, value))
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useState', () => ref(dirty))
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('usePortalAuth', () => ({ user: ref(null), logout: vi.fn() }))
  vi.stubGlobal('usePageStudioLauncher', () => ({ editorOrigin: ref(null), launchPageStudio: vi.fn() }))
  vi.stubGlobal('useFetch', async () => ({ data: ref({ sites: [], total: 0 }), pending: ref(false), error: ref(null), refresh: vi.fn() }))
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(component) }) })
  app.component('PageStudioTemplateCatalogue', { props: ['endpoint'], template: '<div data-catalogue :data-endpoint="endpoint">Catalogue</div>' })
  app.component('StudioCustomerDashboard', { template: '<div data-customer><header>Sign out</header><slot>Existing customer workspace</slot></div>' })
  app.component('UButton', { props: ['to', 'label', 'disabled'], template: '<button :data-to="to" :disabled="disabled">{{ label }}</button>' })
  app.component('UCard', { template: '<div><slot /></div>' })
  for (const name of ['UIcon', 'UPagination', 'StudioBrand', 'StudioThemeToggle', 'StudioArtPanel']) app.component(name, { render: () => null })
  app.mount(host)
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
  return { host, route }
}
it('selects the portal catalogue only for exact templates view and preserves My sites', async () => {
  const { host, route } = await mount(Sites)
  expect(host.querySelector('[data-catalogue]')?.getAttribute('data-endpoint')).toBe('/api/portal/page-studio/templates')
  route.query.view = 'other'
  await nextTick()
  expect(host.querySelector('[data-catalogue]')).toBeNull()
  expect(host.textContent).toContain('My sites')
})
it('uses customer authority and keeps the existing dashboard mounted across views', async () => {
  const { host, route } = await mount(Dashboard)
  expect(host.querySelector('[data-catalogue]')?.getAttribute('data-endpoint')).toBe('/api/portal/page-studio/customer/templates')
  const existing = host.querySelector('[data-customer]') as HTMLElement
  expect(existing.style.display).not.toBe('none')
  expect(existing.textContent).toContain('Sign out')
  expect(existing.textContent).toContain('Catalogue')
  route.query.view = undefined
  await nextTick()
  expect(host.querySelector('[data-customer]')).toBe(existing)
  expect(existing.style.display).not.toBe('none')
})
it('preserves unsaved guards on customer view navigation', async () => {
  const { host } = await mount(Dashboard, 'templates', true)
  expect([...host.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
})
it('links portal Templates from the existing layout without bypassing its unsaved guard', async () => {
  const { host } = await mount(Layout, undefined, true)
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Templates')!
  expect(button.getAttribute('data-to')).toBe('/studio/sites?view=templates')
  expect(button.disabled).toBe(true)
})
