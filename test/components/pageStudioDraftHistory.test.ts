// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch, Suspense } from 'vue'
import type { PageStudioHistoryState } from '~~/shared/pageStudio/draftHistory'
import Workspace from '~~/app/components/page-studio/DraftHistory.client.vue'

const data = ref<PageStudioHistoryState>(), error = ref<unknown>(null), mutation = vi.fn(), refresh = vi.fn(), notify = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const state = () => ({ siteName: 'Synthetic site', currentCheckpointId: 'current', currentVersionId: null, canEdit: true,
  items: [{ id: 'old', checkpointId: 'old', name: null, status: 'saved', createdAt: '2026-09-01T00:00:00Z' }], nextCursor: null })
const stubs = {
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: `<button :disabled="disabled || loading" @click="$emit('click')">{{ label }}<slot /></button>` },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: `<input :disabled="disabled" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UModal: { props: ['open', 'title', 'description'], template: '<aside v-if="open"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /></aside>' },
  UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' },
  UBadge: { template: '<span><slot /></span>' }
}
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(x => x.textContent === label)
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, { siteId: 'site-a', audience: 'portal' }) }) })
  Object.entries(stubs).forEach(([n, c]) => app.component(n, c))
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = state()
  error.value = null
  Object.entries({ computed, ref, watch }).forEach(([n, v]) => vi.stubGlobal(n, v))
  vi.stubGlobal('useFetch', async () => ({ data, error, pending: ref(false), refresh }))
  vi.stubGlobal('$fetch', mutation)
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('usePageStudioLauncher', () => ({ launchPageStudio: vi.fn() }))
})
afterEach(() => {
  apps.splice(0).forEach(x => x.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('draft history controls', () => {
  it('requires restore confirmation and preserves the original request on a lost acknowledgement', async () => {
    mutation.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ checkpointId: 'restored', currentCheckpointId: 'restored', isCurrent: true })
    const host = await mount()
    button(host, 'Restore')!.click()
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    button(host, 'Restore as new draft')!.click()
    await flush()
    const first = mutation.mock.calls[0]
    expect(first[1].body).toMatchObject({ action: 'restore', checkpointId: 'old', expectedCheckpointId: 'current' })
    expect(host.textContent).toContain('could not be confirmed')
    button(host, 'Retry same request')!.click()
    await flush()
    expect(mutation.mock.calls[1]).toEqual(first)
  })
  it('captures a version name and disables saving when a newer draft arrives', async () => {
    const host = await mount()
    button(host, 'Save named version')!.click()
    await flush()
    const field = host.querySelector('input')!
    field.value = 'Before redesign'
    field.dispatchEvent(new Event('input'))
    await flush()
    data.value = { ...state(), currentCheckpointId: 'newer' }
    await flush()
    expect(button(host, 'Save version')!.disabled).toBe(true)
    expect(field.value).toBe('Before redesign')
  })
  it('saves a named draft without submitting or publishing it', async () => {
    mutation.mockResolvedValueOnce({ checkpointId: 'current', versionId: 'v1', currentCheckpointId: 'current', isCurrent: true })
    const host = await mount()
    button(host, 'Save named version')!.click()
    await flush()
    const field = host.querySelector('input')!
    field.value = 'Before redesign'
    field.dispatchEvent(new Event('input'))
    await flush()
    button(host, 'Save version')!.click()
    await flush()
    expect(mutation.mock.calls[0][0]).toBe('/api/portal/page-studio/sites/site-a/history')
    expect(mutation.mock.calls[0][1].body).toMatchObject({ action: 'name', name: 'Before redesign', expectedCheckpointId: 'current' })
    expect(mutation).toHaveBeenCalledTimes(1)
  })
  it('hides mutations for viewers and hides stale data on revoked access', async () => {
    data.value.canEdit = false
    const host = await mount()
    expect(button(host, 'Restore')).toBeUndefined()
    expect(button(host, 'Save named version')).toBeUndefined()
    error.value = { statusCode: 403 }
    await flush()
    expect(host.textContent).not.toContain('Synthetic site')
  })
  it('blocks automatic retry after a conflict', async () => {
    mutation.mockRejectedValueOnce({ statusCode: 409 })
    const host = await mount()
    button(host, 'Restore')!.click()
    await flush()
    button(host, 'Restore as new draft')!.click()
    await flush()
    expect(button(host, 'Retry same request')).toBeUndefined()
    expect(host.textContent).toContain('draft changed')
  })
})
