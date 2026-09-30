// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, reactive, computed, watch, onMounted, type App } from 'vue'
import Onboarding from '~~/app/pages/studio/onboarding.vue'

const api = '/api/portal/page-studio/customer'
let app: App
let host: HTMLElement
const fetchMock = vi.fn()
const navigate = vi.fn()
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(label: string) {
  return [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
}
async function mount() {
  host = document.createElement('div')
  app = createApp(Onboarding)
  app.component('StudioCustomerShell', { template: '<div><header><slot name="header" /></header><slot /></div>' })
  app.component('UButton', { props: ['disabled', 'loading', 'label'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}</div>' })
  for (const name of ['UCard', 'UFormField', 'UInput', 'USelectMenu', 'UCheckbox', 'UCheckboxGroup', 'UIcon', 'NuxtLink']) app.component(name, { template: '<div><slot /></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const [name, value] of Object.entries({ ref, reactive, computed, watch, onMounted, definePageMeta: vi.fn(), useHead: vi.fn(), $fetch: fetchMock, navigateTo: navigate })) vi.stubGlobal(name, value)
})
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})
describe('customer onboarding escape paths', () => {
  it('returns a completed customer to the website overview', async () => {
    fetchMock.mockResolvedValueOnce({ revision: 2, workspaceId: 'owned-workspace', draft: { businessName: 'Flowers', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] } })
    await mount()
    expect(navigate).toHaveBeenCalledWith('/studio/dashboard', { replace: true })
  })
  it.each([403, 500])('allows logout when setup cannot load (%s)', async (statusCode) => {
    fetchMock.mockRejectedValueOnce({ statusCode }).mockResolvedValueOnce({ success: true })
    await mount()
    const signout = button('Sign out')
    expect(signout).toBeTruthy()
    expect(signout.disabled).toBe(false)
    signout.click()
    await flush()
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual([`${api}/setup`, `${api}/logout`])
    expect(navigate).toHaveBeenCalledWith('/studio/signup')
  })
  it('allows explicit logout without overwriting a conflicting draft', async () => {
    fetchMock.mockResolvedValueOnce({ revision: 1, workspaceId: null, draft: { businessName: 'Flowers', businessType: 'Florist', timezone: 'UTC', goals: [] } })
      .mockRejectedValueOnce({ statusCode: 409 }).mockResolvedValueOnce({ success: true })
    await mount()
    button('Save for later').click()
    await flush()
    const signout = button('Sign out without saving')
    expect(signout).toBeTruthy()
    expect(signout.disabled).toBe(false)
    signout.click()
    await flush()
    expect(fetchMock.mock.calls.filter(c => c[1]?.method === 'PUT')).toHaveLength(1)
    expect(navigate).toHaveBeenCalledWith('/studio/signup')
  })
})
