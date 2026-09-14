// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, shallowReactive, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/PortalBookingWorkspace.client.vue'

const siteId = ref('site-a')
const data = ref({ siteId: 'site-a', bookings: [{ id: 'booking-a', customer: { name: 'Synthetic customer' }, travelAt: '2026-12-01T00:00:00Z', pickup: 'Airport', dropoff: 'City', status: 'enquiry', quote: null }], canCreate: true })
const mutation = vi.fn()
const refresh = vi.fn()
const notify = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  PageStudioBookingSitePicker: { template: '<div />' },
  UForm: { template: '<form><slot /></form>' },
  UFormField: { props: ['label', 'error', 'help'], template: '<label>{{ label }}<slot /><span>{{ error }} {{ help }}</span></label>' },
  USelectMenu: { template: '<div />' }, UBadge: { template: '<span><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UPopover: { template: '<div><slot /></div>' },
  UTable: { props: ['data'], template: '<div><div v-for="item in data" :key="item.id">{{ item.customer.name }}</div></div>' },
  USlideover: { props: ['open'], template: '<aside v-if="open"><slot name="body" /><slot name="footer" /></aside>' }
}
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(el => el.textContent === label)
}
async function fill(host: HTMLElement, label: string, value: string) {
  const field = [...host.querySelectorAll('label')].find(el => el.textContent?.startsWith(label))?.querySelector('input')
  expect(field, label).toBeTruthy()
  field!.value = value
  field!.dispatchEvent(new Event('input'))
  await flush()
}
async function fillEnquiry(host: HTMLElement) {
  for (const [label, value] of [['Customer name', 'Synthetic Customer'], ['Email', 'fixture@example.invalid'], ['Phone', '0400000000'], ['Pickup location', 'Airport'], ['Drop-off location', 'City']]) await fill(host, label!, value!)
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace) }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  siteId.value = 'site-a'
  data.value = { siteId: 'site-a', bookings: [{ id: 'booking-a', customer: { name: 'Synthetic customer' }, travelAt: '2026-12-01T00:00:00Z', pickup: 'Airport', dropoff: 'City', status: 'enquiry', quote: null }], canCreate: true }
  Object.entries({ computed, ref, reactive, shallowReactive, watch }).forEach(([name, value]) => vi.stubGlobal(name, value))
  vi.stubGlobal('usePageStudioBookingSite', () => ({ siteId, selectSite: (value: string) => {
    siteId.value = value
  } }))
  vi.stubGlobal('useFetch', async () => ({ data, pending: ref(false), error: ref(null), refresh, clear: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('$fetch', mutation)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('portal booking enquiry workspace', () => {
  it('uses server capability to hide creation for a viewer', async () => {
    data.value.canCreate = false
    const host = await mount()
    expect(host.textContent).toContain('Synthetic customer')
    expect(button(host, 'New enquiry')).toBeUndefined()
  })
  it('validates required fields and pickup time before creating a request', async () => {
    const host = await mount()
    button(host, 'New enquiry')!.click()
    await flush()
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    await fillEnquiry(host)
    await fill(host, 'Pickup time', '25:00')
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(host.textContent).toContain('Choose a valid pickup date')
    expect(mutation).not.toHaveBeenCalled()
  })
  it('retains exactly the same key and payload after closing and resuming an uncertain request', async () => {
    mutation.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({})
    const host = await mount()
    button(host, 'New enquiry')!.click()
    await flush()
    await fillEnquiry(host)
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mutation.mock.calls[0]![1].body).toMatchObject({ customer: { name: 'Synthetic Customer' }, requestKey: expect.any(String) })
    expect(host.querySelector('input')!.disabled).toBe(true)
    button(host, 'Close')!.click()
    await flush()
    button(host, 'Resume enquiry')!.click()
    await flush()
    button(host, 'Retry same enquiry')!.click()
    await flush()
    expect(mutation.mock.calls[0]).toEqual(mutation.mock.calls[1])
    expect(host.querySelector('aside')).toBeNull()
  })
  it('requires an explicit separate enquiry after a conflict and assigns a different key', async () => {
    mutation.mockRejectedValueOnce({ statusCode: 409 }).mockResolvedValueOnce({})
    const host = await mount()
    button(host, 'New enquiry')!.click()
    await flush()
    await fillEnquiry(host)
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(button(host, 'Retry same enquiry')).toBeUndefined()
    expect(mutation).toHaveBeenCalledTimes(1)
    button(host, 'Start separate enquiry')!.click()
    await flush()
    await fillEnquiry(host)
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(mutation.mock.calls[0]![1].body.requestKey).not.toEqual(mutation.mock.calls[1]![1].body.requestKey)
  })
  it('does not announce or refresh an old-site save after navigation during the request', async () => {
    let complete!: (value: unknown) => void
    mutation.mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    const host = await mount()
    button(host, 'New enquiry')!.click()
    await flush()
    await fillEnquiry(host)
    button(host, 'Save enquiry')!.click()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
    siteId.value = 'site-b'
    data.value = { ...data.value, siteId: 'site-b', bookings: [] }
    await flush()
    expect(host.querySelector('aside')).toBeNull()
    const refreshCount = refresh.mock.calls.length
    complete({ booking: { id: 'saved-original-site' } })
    await flush()
    expect(notify).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(refreshCount)
    expect(mutation.mock.calls[0]![1].query).toEqual({ siteId: 'site-a' })
    expect(button(host, 'New enquiry')).toBeTruthy()
  })
  it('hides stale rows on site change and resumes an uncertain draft only under its original site', async () => {
    mutation.mockRejectedValueOnce(new Error('network'))
    const host = await mount()
    button(host, 'New enquiry')!.click()
    await flush()
    await fillEnquiry(host)
    button(host, 'Save enquiry')!.click()
    await flush()
    siteId.value = 'site-b'
    await flush()
    expect(host.querySelector('aside')).toBeNull()
    expect(host.textContent).not.toContain('Synthetic customer')
    expect(button(host, 'New enquiry')).toBeUndefined()
    siteId.value = 'site-a'
    await flush()
    expect(button(host, 'Resume enquiry')).toBeTruthy()
    expect(mutation).toHaveBeenCalledTimes(1)
  })
})
