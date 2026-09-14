// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/FormSubmissionsWorkspace.client.vue'

const receipts = () => [
  { id: 'receipt-live', formId: 'quote', formName: 'Wedding quote', pageRoute: '/weddings', submittedAt: '2026-09-15T00:00:00Z', isTest: false,
    fields: { name: 'Alice', passengers: '8', pickup: 'Airport\nTerminal 2', notes: '<img src=x onerror=alert(1)>', optional: '' } },
  { id: 'receipt-test', formId: 'delivery', pageRoute: '/delivery', submittedAt: 'invalid', isTest: true,
    fields: { name: 'Test customer', delivery_address: 'A'.repeat(2000) } }
]
const data = ref({ submissions: receipts() })
const status = ref('success')
const error = ref<unknown>(null)
const props = reactive({ siteId: 'site-a' })
const refresh = vi.fn()
const clear = vi.fn(() => {
  data.value = { submissions: [] }
  status.value = 'idle'
})
const fetchSubmissions = vi.fn(async () => ({ data, status, error, refresh, clear }))
const apps: ReturnType<typeof createApp>[] = []
async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, props) }) })
  const stubs = {
    UCard: { template: '<section><slot name="header"/><slot/></section>' },
    UFormField: { props: ['label'], template: '<label>{{ label }}<slot/></label>' },
    USelect: { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>' },
    UButton: { props: ['label'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{ label }}</button>' },
    UTable: { props: ['data'], template: '<div><article v-for="row in data">{{ row.name }} {{ row.mode }}<slot name="details-cell" :row="{ original: row }"/></article></div>' },
    USlideover: { props: ['open'], template: '<aside v-if="open"><slot name="body"/></aside>' },
    UAlert: { props: ['title'], template: '<p>{{ title }}</p>' },
    UBadge: { template: '<span><slot/></span>' },
    UIcon: { template: '<span/>' }, USkeleton: { template: '<span/>' }
  }
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
function details(host: HTMLElement) {
  return [...host.querySelectorAll('button')].find(b => b.textContent === 'View details')!
}
async function filter(host: HTMLElement, value: string) {
  const select = host.querySelector('select')!
  select.value = value
  select.dispatchEvent(new Event('change'))
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = { submissions: receipts() }
  status.value = 'success'
  error.value = null
  props.siteId = 'site-a'
  for (const [name, value] of Object.entries({ computed, ref, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('useFetch', fetchSubmissions)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('website submission inspection', () => {
  it('shows every recorded field as escaped text with receipt context and empty values', async () => {
    const host = await mount()
    details(host).click()
    await flush()
    const panel = host.querySelector('aside')!
    for (const value of ['receipt-live', 'Wedding quote', '/weddings', 'passengers', '8', 'Airport\nTerminal 2', '<img src=x onerror=alert(1)>', 'Not provided']) expect(panel.textContent).toContain(value)
    expect(panel.querySelector('img')).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('filters live and test receipts, closes details and supports different schemas and invalid dates', async () => {
    const host = await mount()
    details(host).click()
    await flush()
    await filter(host, 'test')
    expect(host.querySelector('aside')).toBeNull()
    expect(host.textContent).not.toContain('Alice')
    expect(host.textContent).toContain('1 of 2 loaded submissions')
    details(host).click()
    await flush()
    expect(host.querySelector('aside')?.textContent).toContain('delivery_address')
    expect(host.querySelector('aside')?.textContent).toContain('A'.repeat(2000))
    expect(host.querySelector('aside')?.textContent).toContain('Date unavailable')
    await filter(host, 'live')
    expect(host.textContent).toContain('Alice')
    expect(host.textContent).not.toContain('Test customer')
  })
  it('loads the new site after clearing old details without a manual refresh', async () => {
    const host = await mount()
    details(host).click()
    await flush()
    refresh.mockImplementationOnce(async () => {
      data.value = { submissions: [{ ...receipts()[1]!, id: 'site-b-receipt' }] }
      status.value = 'success'
    })
    props.siteId = 'site-b'
    await flush()
    expect(clear).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Test customer')
    expect(fetchSubmissions).toHaveBeenCalledWith(expect.anything(), { watch: false })
    expect(host.querySelector('aside')).toBeNull()
    expect(host.textContent).not.toContain('Alice')
  })
  it('hides details on permission errors and reports empty filtered results accurately', async () => {
    const host = await mount()
    details(host).click()
    await flush()
    error.value = { statusCode: 403 }
    await flush()
    expect(host.querySelector('aside')).toBeNull()
    expect(host.textContent).toContain('Unable to load submissions')
    error.value = null
    data.value = { submissions: [receipts()[0]!] }
    await filter(host, 'test')
    expect(host.textContent).toContain('No matching submissions')
  })
})
