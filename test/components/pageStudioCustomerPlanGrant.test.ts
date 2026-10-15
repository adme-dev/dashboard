// @vitest-environment happy-dom
import { createApp, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Grant from '~~/app/components/page-studio/CustomerPlanGrant.client.vue'

let app: App, host: HTMLElement
const user = ref({ id: 'operator-a', role: 'owner', custom_role_id: null as string | null })
const save = vi.fn(), toast = vi.fn(), granted = vi.fn()
const target = { workspaceId: '10000000-0000-4000-8000-000000000001', workspaceName: 'Flowers',
  siteId: '10000000-0000-4000-8000-000000000002', siteName: 'Flowers website', entitlementId: '10000000-0000-4000-8000-000000000003',
  planKey: 'customer_preview_v1', status: 'trial', effectiveUntil: null, eligible: true,
  limits: { pagesPerSiteLimit: 5, storageBytesLimit: 1048576, domainLimit: 0, aiOperationLimit: 0, buildLimit: 10, trafficBytesLimit: 1048576 } }
const response = { entitlement: { id: '10000000-0000-4000-8000-000000000004', workspaceId: target.workspaceId,
  siteId: target.siteId, planKey: 'studio_business', status: 'active' }, replayed: false }
async function flush() {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
function field(label: string) {
  return [...host.querySelectorAll('[data-field]')].find(f => f.getAttribute('data-field') === label)!
}
function type(label: string, value: string) {
  const input = field(label).querySelector('input,textarea') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}
async function review() {
  type('Plan reference', 'studio_business')
  type('Approval reason', 'Agreed publishing plan')
  const ongoing = field('Access period').querySelector('input') as HTMLInputElement
  ongoing.checked = true
  ongoing.dispatchEvent(new Event('change'))
  await flush()
  button('Review plan')!.click()
  await flush()
}
async function mount() {
  host = document.createElement('div')
  app = createApp(Grant, { target: structuredClone(target), onGranted: granted })
  app.component('UModal', { props: ['title', 'description'], template: '<section><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body"/><slot name="footer"/></section>' })
  app.component('UFormField', { props: ['label', 'help'], template: '<label :data-field="label">{{ label }}<slot/><span>{{ help }}</span></label>' })
  app.component('UInput', { props: ['modelValue', 'type', 'disabled'], emits: ['update:modelValue'], template: '<input :type="type || \'text\'" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UTextarea', { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UCheckbox', { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\',$event.target.checked)"/>{{ label }}</label>' })
  app.component('UButton', { props: ['label', 'loading', 'disabled'], template: '<button :disabled="disabled || loading">{{ label }}<slot/></button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}</div>' })
  app.component('UCalendar', { template: '<div/>' })
  app.component('UPopover', { template: '<div><slot/></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.resetAllMocks()
  user.value = { id: 'operator-a', role: 'owner', custom_role_id: null }
  vi.stubGlobal('useAuth', () => ({ user }))
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('$fetch', save)
  save.mockResolvedValue(response)
})
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})
describe('native customer plan review', () => {
  it('requires explicit review and submits the exact native target without an actor or tenant', async () => {
    await mount()
    await review()
    expect(save).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Flowers website')
    button('Grant publishing access')!.click()
    await flush()
    expect(save).toHaveBeenCalledOnce()
    const body = save.mock.calls[0][1].body
    expect(body).toMatchObject({ workspaceId: target.workspaceId, expectedEntitlementId: target.entitlementId,
      planKey: 'studio_business', effectiveUntil: null, aiOperationLimit: 0 })
    expect(body.actorId).toBeUndefined()
    expect(body.tenantId).toBeUndefined()
    expect(granted).toHaveBeenCalledOnce()
  })
  it('preserves the idempotency key after an uncertain response', async () => {
    save.mockRejectedValueOnce({ statusCode: 503 })
    await mount()
    await review()
    button('Grant publishing access')!.click()
    await flush()
    expect(button('Edit terms')?.disabled).toBe(true)
    button('Grant publishing access')!.click()
    await flush()
    expect(save.mock.calls[0][1].body).toEqual(save.mock.calls[1][1].body)
  })
  it('does not submit without an agreed period or plan reference', async () => {
    await mount()
    button('Review plan')!.click()
    await flush()
    expect(button('Grant publishing access')).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })
  it.each([400, 413])('allows revised terms after a definite validation rejection (%s)', async (statusCode) => {
    save.mockRejectedValueOnce({ statusCode })
    await mount()
    await review()
    button('Grant publishing access')!.click()
    await flush()
    expect(button('Review plan')).toBeDefined()
    await review()
    button('Grant publishing access')!.click()
    await flush()
    expect(save.mock.calls[1][1].body.requestId).not.toBe(save.mock.calls[0][1].body.requestId)
    expect(granted).toHaveBeenCalledOnce()
  })
  it('blocks stale-target retries after conflict', async () => {
    save.mockRejectedValueOnce({ statusCode: 409 })
    await mount()
    await review()
    button('Grant publishing access')!.click()
    await flush()
    expect(button('Grant publishing access')?.disabled).toBe(true)
    expect(host.textContent).toContain('Refresh')
  })
  it('removes grant authority if the operator changes after review', async () => {
    await mount()
    await review()
    user.value = { ...user.value, id: 'operator-b' }
    await flush()
    expect(button('Grant publishing access')?.disabled).toBe(true)
    button('Grant publishing access')?.click()
    await flush()
    expect(save).not.toHaveBeenCalled()
  })
  it('does not double-submit while a request is pending', async () => {
    let resolve!: (v: unknown) => void
    save.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    await mount()
    await review()
    button('Grant publishing access')!.click()
    button('Grant publishing access')!.click()
    await flush()
    expect(save).toHaveBeenCalledOnce()
    resolve(response)
    await flush()
  })
  it('rejects a response for another website', async () => {
    save.mockResolvedValue({ ...response, entitlement: { ...response.entitlement, siteId: 'foreign' } })
    await mount()
    await review()
    button('Grant publishing access')!.click()
    await flush()
    expect(granted).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })
})
