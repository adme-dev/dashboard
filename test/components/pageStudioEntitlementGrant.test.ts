// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, shallowRef } from 'vue'
import { CalendarDate } from '@internationalized/date'
import EntitlementGrant from '~~/app/components/page-studio/EntitlementGrant.vue'

const allowed = ref(true)
const canWrite = ref(true)
const clientId = '20000000-0000-4000-8000-000000000901'
const fetchMock = vi.fn()
const granted = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UTextarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelectMenu: { props: ['modelValue', 'items', 'disabled', 'valueKey'], emits: ['update:modelValue'], template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item[valueKey]" :value="item[valueKey]">{{ item.label }}</option></select>' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UAlert: { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions" /></div>' },
  UCheckbox: { template: '<span />' },
  UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  UCalendar: { emits: ['update:modelValue'], setup: () => ({ future: new CalendarDate(2040, 10, 10) }), template: '<button data-calendar @click="$emit(\'update:modelValue\', future)">Select date</button>' }
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
  const app = createApp({ render: () => h(EntitlementGrant, { onGranted: granted }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
async function fill(host: HTMLElement, withEnd = true) {
  button(host, 'Grant website access')!.click()
  await flush()
  const select = host.querySelector('select')!
  select.value = clientId
  select.dispatchEvent(new Event('change'))
  const plan = host.querySelector('input')!
  plan.value = 'agency-review'
  plan.dispatchEvent(new Event('input'))
  const reason = host.querySelector('textarea')!
  reason.value = 'Authorised internal review period'
  reason.dispatchEvent(new Event('input'))
  if (withEnd) (host.querySelectorAll('[data-calendar]')[1] as HTMLButtonElement).click()
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  allowed.value = true
  canWrite.value = true
  for (const [name, value] of Object.entries({ computed, reactive, ref, shallowRef })) vi.stubGlobal(name, value)
  vi.stubGlobal('useAuth', () => ({ hasPermission: () => allowed.value, canWrite }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useFetch', () => ({ data: ref([{ id: clientId, name: 'Fixture Limo', isActive: true }]), pending: ref(false), error: ref(null), refresh: vi.fn() }))
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockResolvedValue({ entitlement: { id: 'saved' }, replayed: false })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('website access grant form', () => {
  it('sends explicit client, access period, module and numeric limits', async () => {
    const host = await mount()
    await fill(host)
    button(host, 'Save access grant')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/agency/page-studio/subscriptions', { method: 'POST', body: expect.objectContaining({
      clientId, planKey: 'agency-review', status: 'trial', portalCreationEnabled: false,
      storageBytesLimit: 1073741824, trafficBytesLimit: 10737418240,
      allowedModules: ['business-content'], effectiveUntil: expect.any(String), requestId: expect.any(String)
    }) })
    expect(granted).toHaveBeenCalledOnce()
  })
  it('requires a trial end date before any request', async () => {
    const host = await mount()
    await fill(host, false)
    button(host, 'Save access grant')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('access end date')
  })
  it('reuses the request key after an uncertain response', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Response lost'))
    const host = await mount()
    await fill(host)
    button(host, 'Save access grant')!.click()
    await flush()
    expect(host.textContent).toContain('preserved for retry')
    button(host, 'Save access grant')!.click()
    await flush()
    expect(fetchMock.mock.calls[0]![1].body).toEqual(fetchMock.mock.calls[1]![1].body)
    expect(granted).toHaveBeenCalledOnce()
  })
  it('uses a new request key when the operator changes the terms', async () => {
    fetchMock.mockRejectedValue(new Error('Request denied'))
    const host = await mount()
    await fill(host)
    button(host, 'Save access grant')!.click()
    await flush()
    const plan = host.querySelector('input')!
    plan.value = 'revised-review'
    plan.dispatchEvent(new Event('input'))
    await flush()
    button(host, 'Save access grant')!.click()
    await flush()
    expect(fetchMock.mock.calls[0]![1].body.requestId).not.toBe(fetchMock.mock.calls[1]![1].body.requestId)
  })
  it('hides grants for read-only staff and stops a save after permission revocation', async () => {
    canWrite.value = false
    const host = await mount()
    expect(button(host, 'Grant website access')).toBeUndefined()
    canWrite.value = true
    await flush()
    await fill(host)
    allowed.value = false
    await flush()
    button(host, 'Save access grant')?.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
