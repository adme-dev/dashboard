// @vitest-environment happy-dom
import { computed, onMounted, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '~~/app/components/studio/CustomerDashboard.client.vue'
import TransferRequest from '~~/app/components/studio/CustomerTransferRequest.client.vue'
import { button, cleanup, click, control, deferred, dialog, flush, mount, otherSite, siteId } from '../components/pageStudioTransferTestSupport'

const readDashboard = vi.fn(), fetch = vi.fn(), navigate = vi.fn()
const overview = (site = siteId) => ({ siteId: site, businessName: 'Flower shop', businessType: 'Florist', timezone: 'UTC', stage: 3, state: 'verification-pending', canCreate: false, canRetry: false })
const posts = () => fetch.mock.calls.filter(([url, options]) => url.endsWith('/transfer-request') && options?.method === 'POST')
const panel = (host: HTMLElement) => host.querySelector('[aria-labelledby="transfer-request-title"]')
const children = {
  StudioCustomerTransferRequest: TransferRequest,
  StudioCustomerShell: { props: ['title'], template: '<main><h1>{{ title }}</h1><slot name="header"/><slot/></main>' },
  PageStudioCustomerLaunchStatus: { template: '<section>Saved launch status</section>' },
  StudioCustomerCmsSetup: { template: '<section/>' },
  UIcon: { template: '<span/>' },
  USkeleton: { template: '<div/>' }
}
async function request(host: HTMLElement) {
  await click(host, 'Request preparation')
  await click(dialog(host)!, 'Request preparation')
}
beforeEach(() => {
  vi.resetAllMocks()
  readDashboard.mockResolvedValue(overview())
  fetch.mockResolvedValue(null)
  vi.stubGlobal('useFetch', (url: string) => {
    const data = ref(), error = ref()
    return { data, error, refresh: async () => {
      try {
        const result = url.endsWith('/dashboard') ? await readDashboard() : { available: false, siteId: null }
        data.value = result
        error.value = null
      } catch (failure) {
        // Match installed Nuxt asyncData: failed refresh resets data to default.
        error.value = failure
        data.value = undefined
      }
    } }
  })
  for (const [name, value] of Object.entries({ ref, computed, onMounted, useHead: vi.fn(), $fetch: fetch, navigateTo: navigate })) vi.stubGlobal(name, value)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('native overview and real transfer controls during refresh failure', () => {
  it('preserves the same request UUID after lost acknowledgement, failed overview and same-site recovery', async () => {
    const host = await mount(Dashboard, {}, children)
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') throw new Error('lost acknowledgement')
      return null
    })
    await request(host)
    const original = posts()[0][1].body.requestId, originalPanel = panel(host)
    readDashboard.mockRejectedValueOnce({ statusCode: 503 })
    await click(host, 'Refresh status')
    expect(host.textContent).toContain('Status could not refresh')
    expect(panel(host)).toBe(originalPanel)
    expect(button(host, 'Request preparation')).toBeUndefined()
    await click(host, 'Refresh status')
    await request(host)
    expect(posts()).toHaveLength(2)
    expect(posts()[1][1].body.requestId).toBe(original)
  })
  it('keeps a pending POST locked through failed overview and same-site recovery, then safely reads its saved result', async () => {
    const pending = deferred()
    const host = await mount(Dashboard, {}, children)
    let saved: ReturnType<typeof control> | null = null
    fetch.mockImplementation((_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(saved))
    await click(host, 'Request preparation')
    button(dialog(host)!, 'Request preparation')!.click()
    await flush()
    const original = posts()[0][1].body.requestId, originalPanel = panel(host)
    readDashboard.mockRejectedValueOnce({ statusCode: 503 })
    await click(host, 'Refresh status')
    expect(panel(host)).toBe(originalPanel)
    await click(host, 'Refresh status')
    expect(panel(host)).toBe(originalPanel)
    expect(button(host, 'Refresh preparation')?.disabled).toBe(true)
    expect(button(host, 'Request preparation')).toBeUndefined()
    expect(posts()).toHaveLength(1)
    saved = control({ requestId: original })
    pending.resolve(saved)
    await flush()
    expect(posts()).toHaveLength(1)
    expect(host.textContent).toContain('Preparation requested')
    expect(button(host, 'Refresh preparation')?.disabled).toBe(false)
  })
  it('invalidates the prior UUID and late POST on a positively observed different site', async () => {
    const pending = deferred()
    const host = await mount(Dashboard, {}, children)
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') {
        if (posts().length === 1) return pending.promise
        return control({ siteId: otherSite, requestId: options.body.requestId })
      }
      return null
    })
    await click(host, 'Request preparation')
    button(dialog(host)!, 'Request preparation')!.click()
    await flush()
    const original = posts()[0][1].body.requestId, originalPanel = panel(host)
    readDashboard.mockResolvedValue(overview(otherSite))
    await click(host, 'Refresh status')
    expect(panel(host)).not.toBe(originalPanel)
    expect(button(host, 'Request preparation')?.disabled).toBe(false)
    await request(host)
    expect(posts()[1][0]).toContain(otherSite)
    expect(posts()[1][1].body.requestId).not.toBe(original)
    const calls = fetch.mock.calls.length
    pending.resolve(control({ requestId: original, state: 'reviewed', review: { checkpointId: 'old-account-review', applicationId: siteId, objectCount: 1 }, allowedActions: ['approve'] }))
    await flush()
    expect(fetch).toHaveBeenCalledTimes(calls)
    expect(host.textContent).not.toContain('old-account-review')
  })
  it('clears retained context on explicit signout and ignores the former pending operation', async () => {
    const pending = deferred()
    const host = await mount(Dashboard, {}, children)
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/logout')) return { success: true }
      if (options?.method === 'POST') return pending.promise
      return null
    })
    await click(host, 'Request preparation')
    button(dialog(host)!, 'Request preparation')!.click()
    await flush()
    const original = posts()[0][1].body.requestId
    readDashboard.mockRejectedValueOnce({ statusCode: 503 })
    await click(host, 'Refresh status')
    await click(host, 'Sign out')
    expect(navigate).toHaveBeenCalledWith('/studio/signup')
    expect(panel(host)).toBeNull()
    const calls = fetch.mock.calls.length
    pending.resolve(control({ requestId: original }))
    await flush()
    expect(fetch).toHaveBeenCalledTimes(calls)
    // Navigation is mocked: a subsequent verified login to this site starts clean.
    fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? control({ requestId: options.body.requestId }) : null)
    await click(host, 'Refresh status')
    await request(host)
    expect(posts()[1][1].body.requestId).not.toBe(original)
  })
})
