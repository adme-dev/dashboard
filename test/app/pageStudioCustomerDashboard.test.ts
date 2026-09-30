// @vitest-environment happy-dom
import { createApp, nextTick, ref, computed, onMounted, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '~~/app/pages/studio/dashboard.vue'

let app: App, host: HTMLElement
const read = vi.fn(), mutate = vi.fn(), navigate = vi.fn()
const value = { businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'UTC', stage: 0, state: 'available', canCreate: true, canRetry: false }
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
async function mount() {
  host = document.createElement('div')
  app = createApp(Dashboard)
  app.component('StudioCustomerShell', { props: ['title', 'description'], template: '<main><h1>{{ title }}</h1><p>{{ description }}</p><slot name="header"/><slot/></main>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}</div>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}<slot/></span>' })
  for (const name of ['UIcon', 'USkeleton', 'UCard']) app.component(name, { template: '<div><slot/></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.resetAllMocks()
  read.mockResolvedValue({ ...value })
  vi.stubGlobal('useFetch', () => {
    const data = ref(), error = ref()
    return { data, error, refresh: async () => {
      try {
        data.value = await read()
        error.value = null
      } catch (e) { error.value = e }
    } }
  })
  for (const [name, fn] of Object.entries({ ref, computed, onMounted, definePageMeta: vi.fn(), useHead: vi.fn(), $fetch: mutate, navigateTo: navigate })) vi.stubGlobal(name, fn)
})
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})
describe('customer website overview', () => {
  it('creates a preview with an empty body and shows verified progress on reload', async () => {
    await mount()
    expect(host.textContent).toContain('Customer Flowers')
    mutate.mockResolvedValueOnce({ ...value, state: 'preparing', canCreate: false })
    read.mockResolvedValueOnce({ ...value, state: 'preparing', canCreate: false })
    button('Create preview')!.click()
    await flush()
    expect(mutate).toHaveBeenCalledWith('/api/portal/page-studio/customer/preview', { method: 'POST', body: {} })
    expect(host.textContent).toContain('Creating your preview')
    expect(button('Create preview')).toBeUndefined()
  })
  it('shows stale-read failure and disables old actions until a successful refresh', async () => {
    await mount()
    read.mockRejectedValueOnce({ statusCode: 503 })
    button('Refresh status')!.click()
    await flush()
    expect(host.textContent).toContain('could not refresh')
    expect(button('Create preview')?.disabled).toBe(true)
    button('Refresh status')!.click()
    await flush()
    expect(button('Create preview')?.disabled).toBe(false)
  })
  it('keeps sign-out available when the dashboard cannot load', async () => {
    read.mockRejectedValueOnce({ statusCode: 403 })
    await mount()
    mutate.mockResolvedValueOnce({ success: true })
    button('Sign out')!.click()
    await flush()
    expect(navigate).toHaveBeenCalledWith('/studio/signup')
  })
  it('shows verification pending without exposing editor or publication controls', async () => {
    read.mockResolvedValueOnce({ ...value, state: 'verification-pending', stage: 5, canCreate: false })
    await mount()
    expect(host.textContent).toContain('Awaiting verification')
    expect(button('Open editor')).toBeUndefined()
    expect(button('Publish')).toBeUndefined()
  })
  it('rechecks progress after an uncertain creation response before offering retry', async () => {
    await mount()
    mutate.mockRejectedValueOnce({ statusCode: 503 })
    read.mockResolvedValueOnce({ ...value, state: 'preparing', canCreate: false, canRetry: true })
    button('Create preview')!.click()
    await flush()
    expect(host.textContent).toContain('could not confirm')
    expect(button('Resume setup')).toBeTruthy()
    expect(button('Create preview')).toBeUndefined()
  })
  it('returns an unfinished setup to onboarding and expired sessions to sign-in', async () => {
    read.mockResolvedValueOnce({ ...value, state: 'setup-required' })
    await mount()
    expect(navigate).toHaveBeenCalledWith('/studio/onboarding', { replace: true })
    read.mockRejectedValueOnce({ statusCode: 401 })
    button('Refresh status')!.click()
    await flush()
    expect(navigate).toHaveBeenCalledWith('/studio/signup', { replace: true })
  })
})
