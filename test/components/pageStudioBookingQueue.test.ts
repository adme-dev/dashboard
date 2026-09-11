// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense, watch } from 'vue'
import BookingQueue from '~~/app/pages/agency/page-studio/bookings.vue'

const siteId = ref('site-one')
const data = ref({ siteId: 'site-one', bookings: [{ id: 'booking-one', version: 0, status: 'enquiry', customerName: 'Alex' }] })
const fetchMock = vi.fn()
const refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
Object.assign(globalThis, {
  computed, reactive, ref, watch,
  definePageMeta: vi.fn(), useHead: vi.fn(),
  usePageStudioBookingSite: () => ({ siteId, selectSite: (value: string) => {
    siteId.value = value
  } }),
  useFetch: async () => ({ data, pending: ref(false), error: ref(null), refresh, clear: vi.fn() }),
  $fetch: (...args: unknown[]) => fetchMock(...args)
})
const stubs = {
  UDashboardPanel: { template: '<div><slot /></div>' },
  UDashboardNavbar: { template: '<div><slot name="right" /></div>' },
  UCard: { template: '<div><slot /></div>' },
  UAlert: { props: ['title'], template: '<p>{{ title }}</p>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelectMenu: { template: '<div />' },
  PageStudioBookingSitePicker: { template: '<div />' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UTable: { props: ['data'], template: '<div><div v-for="row in data" :key="row.id"><span>{{ row.customerName }}</span><slot name="actions-cell" :row="{ original: row }" /></div></div>' },
  UModal: { props: ['open', 'title'], template: '<section v-if="open"><h2>{{ title }}</h2><slot name="body" /><slot name="footer" /></section>' }
}
async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mountQueue() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(BookingQueue) }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
function button(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll('button')).find(el => el.textContent === label)
}
beforeEach(() => {
  vi.clearAllMocks()
  siteId.value = 'site-one'
  data.value = { siteId: 'site-one', bookings: [{ id: 'booking-one', version: 0, status: 'enquiry', customerName: 'Alex' }] }
  fetchMock.mockResolvedValue({})
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

describe('booking queue site selection', () => {
  it('renders operator actions through the Nuxt UI table cell slot', async () => {
    const host = await mountQueue()
    expect(button(host, 'Quote')).toBeDefined()
    expect(button(host, 'Reject')).toBeDefined()
  })
  it('clears previous-site rows and closes its open decision when switching sites', async () => {
    const host = await mountQueue()
    button(host, 'Quote')?.click()
    await flush()
    expect(host.textContent).toContain('Set booking quote')
    siteId.value = 'site-two'
    await flush()
    expect(host.textContent).not.toContain('Alex')
    expect(host.textContent).not.toContain('Set booking quote')
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sends a rejection to the site that owns the selected booking', async () => {
    const host = await mountQueue()
    button(host, 'Reject')?.click()
    await flush()
    button(host, 'Reject booking')?.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/agency/page-studio/bookings/booking-one/command', expect.objectContaining({ query: { siteId: 'site-one' }, body: expect.objectContaining({ bookingId: 'booking-one', nextStatus: 'rejected' }) }))
  })
})
