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
  app.component('StudioEntryShell', { template: '<div><header><slot name="header" /></header><slot /><footer><slot name="footer" /></footer></div>' })
  app.component('UButton', { props: ['disabled', 'loading', 'label'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}</div>' })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  for (const name of ['UCard', 'USelectMenu', 'UCheckbox', 'UCheckboxGroup', 'UIcon', 'NuxtLink']) app.component(name, { template: '<div><slot /></div>' })
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

async function submitStep() {
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}
describe('customer setup steps', () => {
  it('requires a selected topic and saves it before advancing, retaining it when going back', async () => {
    fetchMock.mockResolvedValueOnce({ revision: 0, workspaceId: null, draft: { businessName: '', businessType: '', timezone: 'UTC', goals: [] } }).mockResolvedValue({ revision: 1 })
    await mount()
    await submitStep()
    expect(host.textContent).toContain('Choose a topic')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    button('Photography').click()
    await submitStep()
    expect(host.textContent).toContain('Business or organisation name')
    expect(fetchMock).toHaveBeenLastCalledWith(`${api}/setup`, expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ expectedRevision: 0, draft: expect.objectContaining({ businessType: 'Photography' }) }) }))
    await submitStep()
    expect(host.textContent).toContain('Add your business name')
    button('Back').click()
    await flush()
    expect(button('Photography').getAttribute('aria-pressed')).toBe('true')
  })
  it('accepts a custom topic and completes only after the business and goals steps are saved', async () => {
    fetchMock.mockResolvedValueOnce({ revision: 2, workspaceId: null, draft: { businessName: 'Flowers', businessType: '', timezone: 'UTC', goals: ['enquiries'] } })
      .mockResolvedValueOnce({ revision: 3 }).mockResolvedValueOnce({ revision: 4 }).mockResolvedValueOnce({ revision: 5 }).mockResolvedValueOnce({ workspaceId: 'new-workspace' })
    await mount()
    const search = host.querySelector('input')!
    search.value = 'Florist'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    button('Use “Florist”').click()
    await submitStep()
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/complete'))).toBe(false)
    await submitStep()
    expect(host.textContent).toContain('Website goals')
    expect(button('Create my workspace')).toBeTruthy()
    await submitStep()
    expect(fetchMock).toHaveBeenLastCalledWith(`${api}/complete`, { method: 'POST', body: { expectedRevision: 5 } })
    expect(navigate).toHaveBeenCalledWith('/studio/dashboard', { replace: true })
  })
})
