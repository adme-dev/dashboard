// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, computed, watch, onMounted, onBeforeUnmount, type App } from 'vue'
import Website from '~~/app/components/studio/CustomerWebsite.client.vue'
import Dashboard from '~~/app/components/studio/CustomerDashboard.client.vue'
import WebsitePage from '~~/app/pages/studio/website.vue'
import DashboardPage from '~~/app/pages/studio/dashboard.vue'

const api = '/api/portal/page-studio/customer'
let app: App, host: HTMLElement
const read = vi.fn(), mutate = vi.fn(), navigate = vi.fn(), defineMeta = vi.fn()
const workspace = { canEdit: true, document: { site: { id: 'owned', name: 'Flowers' }, studio: { checkpointId: 'saved', pages: [] } }, assets: [] }
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(label: string) {
  return [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
}
async function mount(component = Website) {
  host = document.createElement('div')
  app = createApp(component)
  app.component('StudioCustomerWebsite', Website)
  app.component('StudioCustomerDashboard', Dashboard)
  app.component('StudioCustomerShell', { props: ['title'], template: '<main><h1>{{ title }}</h1><slot name="header"/><slot/></main>' })
  app.component('PageStudioCustomerFormsWorkspace', { props: ['apiAudience', 'siteId', 'canEdit'], emits: ['dirty'], template: '<div data-workspace :data-audience="apiAudience" :data-site="siteId" :data-edit="canEdit"><button @click="$emit(\'dirty\', true)">Edit draft</button></div>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], template: '<button :data-to="to" :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}<slot name="actions"/></div>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}</span>' })
  for (const name of ['USkeleton', 'UIcon', 'UCard']) app.component(name, { template: '<div><slot/></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.resetAllMocks()
  read.mockImplementation(url => url.endsWith('/availability') ? { available: true, siteId: 'owned' } : url.endsWith('/dashboard') ? { businessName: 'Flowers', state: 'verification-pending', stage: 5, canOpenStudio: true } : workspace)
  vi.stubGlobal('useFetch', (url: string) => {
    const data = ref(), error = ref(), pending = ref(false)
    return { data, error, pending, refresh: async () => {
      pending.value = true
      try {
        data.value = await read(url)
        error.value = null
      } catch (e) {
        error.value = e
      } finally {
        pending.value = false
      }
    } }
  })
  for (const [name, fn] of Object.entries({ ref, computed, watch, onMounted, onBeforeUnmount, definePageMeta: defineMeta, useHead: vi.fn(), $fetch: mutate, navigateTo: navigate })) vi.stubGlobal(name, fn)
})
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})
describe('native Forms entry', () => {
  it.each([
    { name: 'Forms', page: WebsitePage, endpoint: `${api}/website`, heading: 'Flowers' },
    { name: 'overview', page: DashboardPage, endpoint: `${api}/dashboard`, heading: 'Flowers' }
  ])('mounts the authenticated $name screen through its existing route wrapper', async ({ page, endpoint, heading }) => {
    await mount(page)
    expect(host.querySelector('h1')?.textContent).toBe(heading)
    expect(read).toHaveBeenCalledWith(endpoint)
    expect(defineMeta).toHaveBeenCalledWith({ layout: false })
  })
  it('opens the owned website through its native API and preserves server read-only authority', async () => {
    read.mockResolvedValue({ ...workspace, canEdit: false })
    await mount()
    expect(read).toHaveBeenCalledWith(`${api}/website`)
    expect(host.querySelector('[data-workspace]')?.getAttribute('data-audience')).toBe('customer')
    expect(host.querySelector('[data-workspace]')?.getAttribute('data-edit')).toBe('false')
    expect(button('Website overview')?.getAttribute('data-to')).toBe('/studio/dashboard')
  })
  it('redirects an expired native session without opening a portal login', async () => {
    read.mockRejectedValue({ statusCode: 401 })
    await mount()
    expect(navigate).toHaveBeenCalledWith('/studio/signup', { replace: true })
    expect(host.querySelector('[data-workspace]')).toBeNull()
  })
  it('withholds stale workspace after denied refresh and keeps overview and logout available', async () => {
    await mount()
    read.mockRejectedValue({ statusCode: 403 })
    button('Refresh')!.click()
    await flush()
    expect(host.querySelector('[data-workspace]')).toBeNull()
    expect(host.textContent).toContain('Forms are unavailable')
    expect(button('Website overview')?.disabled).toBe(false)
    mutate.mockResolvedValue({ success: true })
    button('Sign out')!.click()
    await flush()
    expect(mutate).toHaveBeenCalledWith(`${api}/logout`, { method: 'POST', body: {} })
  })
  it('blocks refresh, overview and logout while a draft is dirty', async () => {
    await mount()
    button('Edit draft')!.click()
    await flush()
    for (const name of ['Refresh', 'Website overview', 'Sign out']) expect(button(name)?.disabled).toBe(true)
  })
  it('offers Manage forms only from successful native availability metadata', async () => {
    await mount(Dashboard)
    expect(read).toHaveBeenCalledWith(`${api}/website/availability`)
    expect(button('Manage forms')?.getAttribute('data-to')).toBe('/studio/website')
    read.mockImplementation(url => url.endsWith('/availability') ? { available: false, siteId: null } : { businessName: 'Flowers', state: 'verification-pending', stage: 5, canOpenStudio: true })
    button('Refresh status')!.click()
    await flush()
    expect(button('Manage forms')).toBeUndefined()
    expect(host.textContent).toContain('Continue editing your website')
  })
  it('does not let availability errors break the overview or leave a stale Forms link', async () => {
    await mount(Dashboard)
    read.mockImplementation((url) => {
      if (url.endsWith('/availability')) throw { statusCode: 503 }
      return { businessName: 'Flowers', state: 'verification-pending', stage: 5, canOpenStudio: true }
    })
    button('Refresh status')!.click()
    await flush()
    expect(button('Manage forms')).toBeUndefined()
    expect(button('Open Studio')?.disabled).toBe(false)
  })
})
