// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, shallowRef, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/BookingWorkspace.client.vue'

const siteId = ref('site-a')
const readOnly = ref(false)
const booking = { id: 'booking-a', version: 0, status: 'enquiry', customerName: 'Synthetic customer', pickupAt: '2026-12-01T00:00:00Z', pickupLocation: 'Airport', dropoffLocation: 'City', quoteAmountCents: null, currency: null, quoteVersion: null }
const data = ref({ siteId: 'site-a', bookings: [booking] })
const mutation = vi.fn()
const refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UDashboardPanel: { template: '<main><slot /></main>' }, UDashboardNavbar: { template: '<header><slot name="right" /></header>' },
  PageStudioBookingSitePicker: { template: '<div />' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  USelectMenu: { template: '<div />' }, UBadge: { template: '<span><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UPopover: { template: '<div><slot /></div>' },
  UTable: { props: ['data'], template: '<div><div v-for="item in data" :key="item.id">{{ item.customerName }}<slot name="actions-cell" :row="{ original: item }" /></div></div>' },
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="body" /><slot name="footer" /></section>' }
}
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(el => el.textContent === label)
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
  readOnly.value = false
  data.value = { siteId: 'site-a', bookings: [{ ...booking }] }
  Object.entries({ computed, ref, shallowRef, watch }).forEach(([name, value]) => vi.stubGlobal(name, value))
  vi.stubGlobal('useAuth', () => ({ hasPermission: () => true, isReadOnly: readOnly }))
  vi.stubGlobal('usePageStudioBookingSite', () => ({ siteId, selectSite: (id: string) => {
    siteId.value = id
  } }))
  vi.stubGlobal('useFetch', async () => ({ data, pending: ref(false), error: ref(null), refresh, clear: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('$fetch', mutation)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('booking operator workspace', () => {
  it('retains the exact intent after a lost acknowledgement', async () => {
    mutation.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({})
    const host = await mount()
    button(host, 'Quote')!.click()
    await flush()
    const amount = host.querySelector('input')!
    amount.value = '125.50'
    amount.dispatchEvent(new Event('input'))
    await flush()
    button(host, 'Save decision')!.click()
    await flush()
    expect(mutation.mock.calls[0]![1].body.quote.amountCents).toBe(12550)
    expect(host.querySelector('input')!.disabled).toBe(true)
    button(host, 'Retry update')!.click()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(mutation.mock.calls[0]).toEqual(mutation.mock.calls[1])
    expect(host.querySelector('section')).toBeNull()
  })
  it('clears the dialog and does not show another website’s stale rows', async () => {
    const host = await mount()
    button(host, 'Quote')!.click()
    await flush()
    siteId.value = 'site-b'
    await flush()
    expect(host.querySelector('section')).toBeNull()
    expect(host.textContent).not.toContain('Synthetic customer')
    expect(mutation).not.toHaveBeenCalled()
  })
  it('hides mutations for read-only staff', async () => {
    readOnly.value = true
    const host = await mount()
    expect(host.textContent).toContain('Synthetic customer')
    expect(button(host, 'Quote')).toBeUndefined()
  })
})
