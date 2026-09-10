// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import AgencySetup from '~~/app/components/page-studio/AgencySetup.vue'

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
  const app = createApp({ render: () => h(AgencySetup, { siteId }) })
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
  state.value = { supported: true, serviceAvailable: true, proposal: null, provisioning: null }
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
describe('agency website setup controls', () => {
  it('creates a proposal for the mounted site without client or actor overrides', async () => {
    const host = await mount()
    button(host, 'Create setup proposal')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(`/api/agency/page-studio/sites/${siteId}/setup-proposal`, { method: 'POST', body: { expectedRevision: 0, setupSource: 'template', setupBrief: '' } })
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('requires a brief when the brief-based approach is selected', async () => {
    const host = await mount()
    const select = host.querySelector('select')!
    select.value = 'chat'
    select.dispatchEvent(new Event('change'))
    await flush()
    button(host, 'Create setup proposal')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Enter a website brief')
  })
  it('shows the saved plan and confirms approval against its revision', async () => {
    state.value.proposal = proposal()
    const host = await mount()
    expect(host.textContent).toContain('Approved hire rates')
    button(host, 'Approve setup')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    button(host, 'Confirm approval')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(`/api/agency/page-studio/setup-proposals/${siteId}/decision`, { method: 'POST', body: { decision: 'accepted', expectedRevision: 1 } })
    expect(button(host, 'Confirm approval')).toBeUndefined()
    expect(button(host, 'Confirm rejection')).toBeUndefined()
  })
  it('does not confirm a different revision after a refresh', async () => {
    state.value.proposal = proposal()
    const host = await mount()
    button(host, 'Approve setup')!.click()
    await flush()
    state.value.proposal = proposal('proposed', 2)
    await flush()
    button(host, 'Confirm approval')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('changed')
  })
  it('requests setup only after confirmation and only for an accepted proposal', async () => {
    state.value.proposal = proposal('accepted')
    const host = await mount()
    expect(fetchMock).not.toHaveBeenCalled()
    button(host, 'Prepare website')!.click()
    await flush()
    button(host, 'Start setup')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(`/api/agency/page-studio/sites/${siteId}/provision`, { method: 'POST', body: { expectedRevision: 1 } })
    expect(button(host, 'Start setup')).toBeUndefined()
    expect(button(host, 'Confirm rejection')).toBeUndefined()
  })
  it('keeps a failed confirmation available and prevents duplicate requests while saving', async () => {
    state.value.proposal = proposal('accepted')
    let rejectRequest!: (error: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectRequest = reject
    }))
    const host = await mount()
    button(host, 'Prepare website')!.click()
    await flush()
    button(host, 'Start setup')!.click()
    await flush()
    expect(button(host, 'Start setup')?.disabled).toBe(true)
    expect(button(host, 'Cancel')?.disabled).toBe(true)
    button(host, 'Start setup')!.click()
    expect(fetchMock).toHaveBeenCalledOnce()
    rejectRequest({ data: { statusMessage: 'The setup service is unavailable' } })
    await flush()
    expect(host.textContent).toContain('The setup service is unavailable')
    expect(button(host, 'Start setup')?.disabled).toBe(false)
    button(host, 'Cancel')!.click()
    await flush()
    expect(button(host, 'Start setup')).toBeUndefined()
  })
  it('keeps read-only users and non-approvers outside mutation controls', async () => {
    state.value.proposal = proposal()
    approve.value = false
    const host = await mount()
    expect(button(host, 'Approve setup')).toBeUndefined()
    canWrite.value = false
    state.value.proposal = null
    await flush()
    expect(button(host, 'Create setup proposal')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('shows unavailable service, queued and failed status without automatically retrying', async () => {
    state.value.proposal = proposal('accepted')
    state.value.serviceAvailable = false
    const host = await mount()
    expect(button(host, 'Prepare website')?.disabled).toBe(true)
    state.value.serviceAvailable = true
    state.value.provisioning = { phase: 'requested' }
    await flush()
    expect(host.textContent).toContain('Waiting for processing')
    state.value.provisioning = { phase: 'failed' }
    await flush()
    expect(host.textContent).toContain('Setup needs attention')
    expect(button(host, 'Prepare website')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('preserves errors and does not mutate while setup state cannot be read', async () => {
    readError.value = new Error('Unavailable')
    const host = await mount()
    expect(host.textContent).toContain('Setup could not be loaded')
    expect(button(host, 'Create setup proposal')).toBeUndefined()
  })
})
