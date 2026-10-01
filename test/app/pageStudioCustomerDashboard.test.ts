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
  it('opens the managed draft by credential POST without URL or persistent storage', async () => {
    read.mockResolvedValue({ ...value, state: 'verification-pending', canCreate: false, canOpenStudio: true })
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      expect(this.method).toBe('post')
      expect(this.action).toBe('https://editor.example.test/customer/launch')
      expect(this.target).toBe('_self')
      expect([...new FormData(this).entries()]).toEqual([['ticket', 't'.repeat(64)]])
    })
    await mount()
    expect(host.textContent).toContain('Continue editing your website')
    expect(host.textContent).toContain('Not published')
    expect(host.textContent).toContain('Preview verified: pending')
    expect(mutate).not.toHaveBeenCalled()
    let resolve!: (value: unknown) => void
    mutate.mockImplementationOnce(() => new Promise((done) => {
      resolve = done
    }))
    button('Open Studio')!.click()
    button('Open Studio')!.click()
    await flush()
    expect(mutate).toHaveBeenCalledTimes(1)
    resolve({ token: 't'.repeat(64), editorOrigin: 'https://editor.example.test', expiresAt: new Date(Date.now() + 60000).toISOString() })
    await flush()
    expect(mutate).toHaveBeenCalledWith('/api/portal/page-studio/customer/editor', { method: 'POST', body: {} })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(document.querySelector('form')).toBeNull()
    expect(localStorage.length + sessionStorage.length).toBe(0)
    submit.mockRestore()
  })
  it('hides unavailable editing and refuses stale status or a failed launch', async () => {
    read.mockResolvedValue({ ...value, state: 'verification-pending', canCreate: false, canOpenStudio: false })
    await mount()
    expect(button('Open Studio')).toBeUndefined()
    read.mockResolvedValue({ ...value, state: 'verification-pending', canCreate: false, canOpenStudio: true })
    button('Refresh status')!.click()
    await flush()
    mutate.mockRejectedValueOnce(Object.assign(new Error('private storage error'), { statusCode: 401 }))
    button('Open Studio')!.click()
    await flush()
    expect(navigate).toHaveBeenCalledWith('/studio/signup', { replace: true })
    expect(host.textContent).toContain('We could not open Studio')
    expect(host.textContent).not.toContain('private storage error')
    read.mockRejectedValueOnce(new Error('offline'))
    button('Refresh status')!.click()
    await flush()
    expect(button('Open Studio')!.disabled).toBe(true)
    button('Open Studio')!.click()
    expect(mutate).toHaveBeenCalledTimes(1)
  })
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
  it('requires an explicit click to resume under a new login and refreshes after uncertainty', async () => {
    const recovery = { expectedRecoveryId: null, expectedJobDigest: 'a'.repeat(64) }
    read.mockResolvedValue({ ...value, state: 'recovery-required', canCreate: false, recovery })
    await mount()
    expect(mutate).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Continue your website setup')
    mutate.mockRejectedValueOnce({ statusCode: 503 })
    read.mockResolvedValueOnce({ ...value, state: 'preparing', canCreate: false })
    button('Resume setup')!.click()
    button('Resume setup')!.click()
    await flush()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith('/api/portal/page-studio/customer/recover', { method: 'POST', body: { ...recovery, recoveryId: expect.any(String) } })
    expect(host.textContent).toContain('could not confirm')
    expect(host.textContent).toContain('Creating your preview')
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
