// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import PortalSiteCreate from '~~/app/components/page-studio/PortalSiteCreate.client.vue'

const user = ref({ role: 'manager' })
const fetchMock = vi.fn()
const created = vi.fn()
const navigate = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UTextarea: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
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
  const app = createApp({ render: () => h(PortalSiteCreate, { onCreated: created }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
async function fill(host: HTMLElement) {
  button(host, 'New website')!.click()
  await flush()
  const inputs = host.querySelectorAll('input')
  inputs[0]!.value = 'Fantasy Limo'
  inputs[1]!.value = 'fantasy-limo'
  inputs.forEach(input => input.dispatchEvent(new Event('input')))
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  user.value = { role: 'manager' }
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('usePortalAuth', () => ({ user }))
  vi.stubGlobal('navigateTo', navigate)
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockResolvedValue({ site: { id: 'site-created' } })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('customer website creation', () => {
  it('creates a template proposal without accepting client scope and opens its setup', async () => {
    const host = await mount()
    await fill(host)
    button(host, 'Create website draft')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/page-studio/sites', {
      method: 'POST', body: { name: 'Fantasy Limo', route: 'fantasy-limo', starterVersion: 'limousine-v1', setupSource: 'template', setupBrief: '' }
    })
    expect(created).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/portal/page-studio/site-created/setup')
  })
  it('reveals the brief input and refuses an empty description', async () => {
    const host = await mount()
    await fill(host)
    const source = host.querySelectorAll('select')[1]!
    source.value = 'chat'
    source.dispatchEvent(new Event('change'))
    await flush()
    expect(host.querySelector('textarea')).not.toBeNull()
    button(host, 'Create website draft')!.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    const brief = host.querySelector('textarea')!
    brief.value = 'Airport transfers and bookings'
    brief.dispatchEvent(new Event('input'))
    await flush()
    button(host, 'Create website draft')!.click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.objectContaining({ setupSource: 'chat', setupBrief: 'Airport transfers and bookings' })
    }))
  })
  it('hides creation for viewers and rechecks a role downgrade before saving', async () => {
    user.value = { role: 'viewer' }
    const host = await mount()
    expect(button(host, 'New website')).toBeUndefined()
    user.value = { role: 'manager' }
    await flush()
    await fill(host)
    user.value = { role: 'viewer' }
    await flush()
    button(host, 'Create website draft')?.click()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('retains the brief after failure and gives reconciliation guidance without retrying', async () => {
    fetchMock.mockRejectedValue(new Error('connection lost'))
    const host = await mount()
    await fill(host)
    button(host, 'Create website draft')!.click()
    await flush()
    expect(host.textContent).toContain('Refresh your websites to check whether it was saved')
    expect(host.querySelector('input')!.value).toBe('Fantasy Limo')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })
})
