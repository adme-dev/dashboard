// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import AgencySiteCreate from '~~/app/components/page-studio/AgencySiteCreate.client.vue'

const allowed = ref(true)
const canWrite = ref(true)
const clientId = '20000000-0000-4000-8000-000000000901'
const clients = ref([{ id: clientId, name: 'Fantasy Limo', isActive: true }, { id: 'inactive', name: 'Inactive client', isActive: false }])
const fetchMock = vi.fn()
const refresh = vi.fn()
const created = vi.fn()
const toast = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelectMenu: { props: ['modelValue', 'items', 'disabled', 'valueKey'], emits: ['update:modelValue'], template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item[valueKey]" :value="item[valueKey]">{{ item.label }}</option></select>' },
  UButton: { props: ['label', 'disabled', 'loading', 'to'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UAlert: { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions" /></div>' }
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
  const app = createApp({ render: () => h(AgencySiteCreate, { onCreated: created }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
async function fill(host: HTMLElement) {
  button(host, 'New website')!.click()
  await flush()
  const select = host.querySelector('select')!
  select.value = clientId
  select.dispatchEvent(new Event('change'))
  const inputs = host.querySelectorAll('input')
  inputs[0]!.value = 'Fantasy Limo'
  inputs[1]!.value = 'fantasy-limo'
  inputs.forEach(input => input.dispatchEvent(new Event('input')))
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  allowed.value = true
  canWrite.value = true
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useAuth', () => ({ hasPermission: () => allowed.value, canWrite }))
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('useFetch', () => ({ data: clients, pending: ref(false), error: ref(null), refresh }))
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockResolvedValue({ site: { id: 'site-created' } })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('agency website creation', () => {
  it('saves the selected client and template through the agency endpoint', async () => {
    const host = await mount()
    await fill(host)
    expect(host.textContent).not.toContain('Inactive client')
    button(host, 'Create draft')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/agency/page-studio/sites', {
      method: 'POST', body: { clientId, name: 'Fantasy Limo', route: 'fantasy-limo', starterVersion: 'limousine-v1' }
    })
    expect(created).toHaveBeenCalledOnce()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Website draft created' }))
  })

  it('requires a selected client before sending a request', async () => {
    const host = await mount()
    button(host, 'New website')!.click()
    await flush()
    button(host, 'Create draft')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Select an active client')
  })

  it('hides creation for read-only staff and rechecks permissions before saving', async () => {
    canWrite.value = false
    const host = await mount()
    expect(button(host, 'New website')).toBeUndefined()
    canWrite.value = true
    await flush()
    await fill(host)
    allowed.value = false
    await flush()
    button(host, 'Create draft')?.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves the draft and explains an entitlement denial without retrying', async () => {
    fetchMock.mockRejectedValue({ data: { statusMessage: 'The client does not have an active Page Studio subscription' } })
    const host = await mount()
    await fill(host)
    button(host, 'Create draft')!.click()
    await flush()
    expect(host.textContent).toContain('does not have an active Page Studio subscription')
    expect(host.querySelector('input')!.value).toBe('Fantasy Limo')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(created).not.toHaveBeenCalled()
  })
})
