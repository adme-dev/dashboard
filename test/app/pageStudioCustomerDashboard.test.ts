// @vitest-environment happy-dom
import { createApp, nextTick, ref, computed, onMounted, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFetch } from 'ofetch'
import Dashboard from '~~/app/components/studio/CustomerDashboard.client.vue'

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
// Keep actual ofetch timeout/retry behavior; only the remote response is delayed.
function useTimedDashboardReads() {
  const fetch = createFetch({ fetch: async (request, options) => {
    if (String(request).endsWith('/website/availability')) return Response.json({ available: false, siteId: null })
    const signal = options?.signal
    const result = await new Promise((resolve, reject) => {
      const abort = () => reject(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      Promise.resolve(read()).then((value) => {
        signal?.removeEventListener('abort', abort)
        resolve(value)
      }, (error) => {
        signal?.removeEventListener('abort', abort)
        reject(error)
      })
    })
    return Response.json(result)
  } })
  vi.stubGlobal('useFetch', (url: string, options: { timeout: number, retry?: number }) => {
    const data = ref(), error = ref()
    return { data, error, refresh: async () => {
      try {
        data.value = await fetch(url, { timeout: options.timeout, retry: options.retry })
        error.value = null
      } catch (failure) {
        error.value = failure
        data.value = undefined
      }
    } }
  })
}
async function mount() {
  host = document.createElement('div')
  app = createApp(Dashboard)
  app.component('StudioCustomerShell', { props: ['title', 'description'], template: '<main><h1>{{ title }}</h1><p>{{ description }}</p><slot name="header"/><slot/></main>' })
  app.component('PageStudioCustomerLaunchStatus', { props: ['siteId', 'audience'], template: '<section data-launch-status :data-site="siteId" :data-audience="audience">Current launch status</section>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}</div>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}<slot/></span>' })
  for (const name of ['UIcon', 'USkeleton', 'UCard', 'StudioCustomerTransferRequest', 'StudioCustomerCmsSetup']) app.component(name, { template: '<div><slot/></div>' })
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
      } catch (e) {
        error.value = e
        data.value = undefined
      }
    } }
  })
  for (const [name, fn] of Object.entries({ ref, computed, onMounted, definePageMeta: vi.fn(), useHead: vi.fn(), $fetch: mutate, navigateTo: navigate })) vi.stubGlobal(name, fn)
})
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('customer website overview', () => {
  it('shows saved source steps and transfer preparation without offering editing or preview recovery', async () => {
    read.mockResolvedValue({ ...value, siteId: 'saved-site', state: 'transfer-pending', stage: 4,
      managedTransfer: null, canCreate: false, canRetry: false, canOpenStudio: false, canPrepareCms: false })
    await mount()
    expect(host.textContent).toContain('Prepare your website transfer')
    expect(host.textContent).not.toContain('Your setup needs attention')
    expect(host.textContent).not.toContain('Your website transfer is in progress')
    for (const name of ['Website prepared', 'Website content saved']) {
      const row = [...host.querySelectorAll('li')].find(node => node.textContent?.includes(name))
      expect(row?.textContent).toContain(': complete')
    }
    for (const label of ['Open Studio', 'Create preview', 'Resume setup']) expect(button(label)).toBeUndefined()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('waits for a slow verified overview without offering duplicate creation', async () => {
    vi.useFakeTimers()
    useTimedDashboardReads()
    read.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
      ...value, siteId: 'saved-site', state: 'verification-pending', stage: 5, canCreate: false
    }), 31730)))
    await mount()
    await vi.advanceTimersByTimeAsync(10001)
    expect(host.textContent).not.toContain('Status could not refresh')
    expect(button('Refresh status')?.disabled).toBe(true)
    button('Refresh status')!.click()
    expect(button('Create preview')).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(21729)
    await flush()
    expect(host.textContent).toContain('Awaiting verification')
    expect(button('Refresh status')?.disabled).toBe(false)
    expect(button('Create preview')).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
    expect(mutate).not.toHaveBeenCalled()
  })
  it('ends an overdue read without automatic retry and recovers only on explicit refresh', async () => {
    vi.useFakeTimers()
    useTimedDashboardReads()
    await mount()
    let resolveLate!: (value: unknown) => void
    read.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLate = resolve
    }))
    button('Refresh status')!.click()
    await flush()
    await vi.advanceTimersByTimeAsync(119999)
    expect(host.textContent).not.toContain('Status could not refresh')
    expect(button('Refresh status')?.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(host.textContent).toContain('Status could not refresh')
    expect(button('Refresh status')?.disabled).toBe(false)
    expect(button('Create preview')?.disabled).toBe(true)
    button('Create preview')!.click()
    resolveLate({ ...value })
    await flush()
    expect(host.textContent).toContain('Status could not refresh')
    expect(read).toHaveBeenCalledTimes(2)
    expect(mutate).not.toHaveBeenCalled()
    read.mockResolvedValueOnce({ ...value, siteId: 'saved-site', state: 'verification-pending', stage: 5, canCreate: false })
    button('Refresh status')!.click()
    await flush()
    expect(host.textContent).not.toContain('Status could not refresh')
    expect(host.textContent).toContain('Awaiting verification')
    expect(button('Create preview')).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(3)
    expect(mutate).not.toHaveBeenCalled()
  })
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
    expect(host.textContent).not.toContain('Not published')
    expect(host.textContent).toContain('Studio available: complete')
    expect(host.textContent).toContain('Website prepared: complete')
    expect(host.textContent).toContain('Website content saved: complete')
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
  it('keeps completed transfer distinct from an editor that has not connected', async () => {
    read.mockResolvedValue({ ...value, siteId: 'saved-site', state: 'connection-pending', stage: 5,
      canCreate: false, canRetry: false, canPrepareCms: false, canOpenStudio: false })
    await mount()
    expect(host.textContent).toContain('Your website transfer is saved')
    expect(host.textContent).toContain('Publishing remains a separate step')
    expect(button('Open Studio')).toBeUndefined()
    expect(button('Create website preview')).toBeUndefined()
    expect(host.querySelector('[data-launch-status]')?.getAttribute('data-site')).toBe('saved-site')
    expect(mutate).not.toHaveBeenCalled()
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

it('shows the native launch panel only for a current bound website and removes it on refresh failure', async () => {
  read.mockResolvedValue({ ...value, siteId: 'native-site', canCreate: false })
  await mount()
  expect(host.querySelector('[data-launch-status]')?.getAttribute('data-site')).toBe('native-site')
  expect(host.querySelector('[data-launch-status]')?.getAttribute('data-audience')).toBe('customer')
  read.mockRejectedValueOnce(new Error('session expired'))
  button('Refresh status')!.click()
  await flush()
  expect(host.querySelector('[data-launch-status]')).toBeNull()
})
it('does not infer a website from forms availability or an incomplete setup', async () => {
  await mount()
  expect(host.querySelector('[data-launch-status]')).toBeNull()
})
