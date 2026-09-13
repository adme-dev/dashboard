// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import PortalSetup from '~~/app/components/page-studio/PortalSetup.client.vue'

const siteId = '50000000-0000-4000-8000-000000000901'
const canWrite = ref(true)
const approve = ref(true)
const state = ref<Record<string, unknown>>({})
const readError = ref<unknown>(null)
const pending = ref(false)
const fetchMock = vi.fn()
const refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const proposal = (status = 'proposed', revision = 1) => ({ revision, status, source: 'template', brief: null, plan: { pages: ['home', 'bookings'], modules: ['business-content', 'bookings'], missingFacts: ['Approved hire rates'] } })
const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /><slot name="footer" /></section>' },
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UTextarea: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelect: { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UAlert: { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions" /></div>' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' }
}
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll('button')).find(el => el.textContent === label)
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(PortalSetup, { siteId }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  canWrite.value = true
  approve.value = true
  pending.value = false
  readError.value = null
  state.value = { name: 'Portal Fixture', canEdit: true, supported: true, serviceAvailable: true, proposal: null, provisioning: null }
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useAuth', () => ({ canWrite, hasPermission: (permission: string) => permission !== 'PAGE_STUDIO_APPROVE' || approve.value }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useFetch', () => ({ data: state, pending, error: readError, refresh }))
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockResolvedValue({})
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('portal setup review and details', () => {
  it('submits a first plan with no caller-controlled customer or actor', async () => {
    const host = await mount()
    button(host, 'Submit plan for review')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(`/api/portal/page-studio/sites/${siteId}/setup-proposal`, { method: 'POST', body: { expectedRevision: 0, setupSource: 'template', setupBrief: '' } })
  })
  it('retains customer details when the request fails and suppresses raw errors', async () => {
    state.value.proposal = proposal()
    fetchMock.mockRejectedValue({ data: { statusMessage: 'private-provider-token' } })
    const host = await mount()
    button(host, 'Update business details')!.click()
    await flush()
    const input = host.querySelector('textarea')!
    input.value = 'Confirmed business details'
    input.dispatchEvent(new Event('input'))
    await flush()
    button(host, 'Submit plan for review')!.click()
    await flush()
    expect(input.value).toBe('Confirmed business details')
    expect(host.textContent).toContain('Your details remain here')
    expect(host.textContent).not.toContain('private-provider-token')
    expect(fetchMock.mock.calls[0][1].body).toEqual({ expectedRevision: 1, setupSource: 'chat', setupBrief: 'Confirmed business details' })
  })
  it('does not silently apply an old draft over a newly refreshed revision', async () => {
    state.value.proposal = proposal()
    const host = await mount()
    button(host, 'Update business details')!.click()
    await flush()
    state.value.proposal = proposal('proposed', 2)
    await flush()
    button(host, 'Submit plan for review')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('website plan changed')
  })
  it('shows the retained plan but hides mutations from a viewer', async () => {
    state.value.canEdit = false
    state.value.proposal = proposal()
    const host = await mount()
    expect(host.textContent).toContain('Approved hire rates')
    expect(button(host, 'Update business details')).toBeUndefined()
    expect(button(host, 'Approve setup')).toBeUndefined()
  })
  it('keeps approved plans immutable and never starts provisioning automatically', async () => {
    state.value.proposal = proposal('accepted')
    const host = await mount()
    expect(host.textContent).toContain('Plan approved')
    expect(button(host, 'Update business details')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not offer submission while the latest state cannot be read', async () => {
    readError.value = new Error('Unavailable')
    const host = await mount()
    expect(host.textContent).toContain('Setup could not be loaded')
    expect(button(host, 'Submit plan for review')).toBeUndefined()
  })
})
