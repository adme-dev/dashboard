// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onUnmounted, ref, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/StagingWorkspace.client.vue'
import { pageStudioStagingAddress } from '~~/shared/pageStudio/staging'

const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const initial = () => ({ siteId, ...pageStudioStagingAddress(siteId), status: 'not_published', canManage: true, active: null, currentDigest: 'a'.repeat(64), failure: null })
const data = ref(initial()), error = ref<unknown>(null), pending = ref(false)
const mutation = vi.fn(), refresh = vi.fn(), notify = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, { siteId, audience: 'portal' }) }) })
  app.component('UCard', { template: '<section><slot name="header"/><slot/><slot name="footer"/></section>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p>{{title}} {{description}}</p>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], emits: ['click'], template: '<a v-if="to" :href="to">{{label}}</a><button v-else :disabled="disabled || loading" @click="$emit(\'click\')">{{label}}</button>' })
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = initial()
  error.value = null
  pending.value = false
  Object.entries({ computed, ref, watch, onUnmounted }).forEach(([name, value]) => vi.stubGlobal(name, value))
  vi.stubGlobal('useFetch', async () => ({ data, error, pending, refresh }))
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('$fetch', mutation)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('client staging controls', () => {
  it('shows the allocated address but no Open link before a verified deployment', async () => {
    const host = await mount()
    expect(host.textContent).toContain(initial().hostname)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toContain('No custom domain required')
  })
  it('updates the saved digest and opens only the validated same-site result', async () => {
    const host = await mount()
    mutation.mockResolvedValueOnce({ ...initial(), status: 'ready', active: { id: '20000000-0000-4000-8000-000000000001', checkpointId: 'saved', digest: initial().currentDigest, deployedAt: '2026-09-22T00:00:00.000Z' } })
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')
    button?.click()
    await flush()
    expect(mutation).toHaveBeenCalledWith(`/api/portal/page-studio/sites/${siteId}/staging`, expect.objectContaining({ method: 'POST', body: { digest: initial().currentDigest, expectedActiveId: null, idempotencyKey: expect.any(String) } }))
    expect(host.querySelector('a')?.href).toBe(initial().url)
  })
  it('does not give viewers an update action and hides stale links after read failure', async () => {
    data.value = { ...initial(), canManage: false }
    const host = await mount()
    expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Update staging')).toBe(false)
    error.value = new Error('Unavailable')
    await flush()
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toContain('Staging status unavailable')
  })
  it('rejects a foreign hostname returned by the mutation', async () => {
    const host = await mount()
    mutation.mockResolvedValueOnce({ ...initial(), hostname: 'attacker.test', url: 'https://attacker.test/' })
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')?.click()
    await flush()
    expect(host.querySelector('a')).toBeNull()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
  it('explains an exhausted package allowance without offering a misleading success', async () => {
    const host = await mount()
    mutation.mockRejectedValue({ statusCode: 429 })
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')?.click()
    await flush()
    expect(host.querySelector('a')).toBeNull()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Monthly build allowance reached', color: 'error' }))
  })
  it('starts a new saved-version request after polling confirms the previous attempt', async () => {
    const host = await mount()
    mutation.mockResolvedValueOnce({ ...initial(), status: 'building' })
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')
    button?.click()
    await flush()
    const first = mutation.mock.calls[0][1].body
    Object.assign(data.value, { status: 'ready', active: { id: '20000000-0000-4000-8000-000000000001', checkpointId: 'saved', digest: initial().currentDigest, deployedAt: '2026-09-22T00:00:00.000Z' } })
    await flush()
    data.value.currentDigest = 'b'.repeat(64)
    mutation.mockRejectedValueOnce(new Error('Connection lost'))
    button?.click()
    await flush()
    const second = mutation.mock.calls[1][1].body
    expect(second.digest).toBe('b'.repeat(64))
    expect(second.expectedActiveId).toBe('20000000-0000-4000-8000-000000000001')
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
  })

  it('keeps an uncertain request until refresh proves its active snapshot changed', async () => {
    const oldActive = { id: '20000000-0000-4000-8000-000000000001', checkpointId: 'old', digest: initial().currentDigest, deployedAt: '2026-09-21T00:00:00.000Z' }
    Object.assign(data.value, { status: 'ready', active: oldActive })
    const host = await mount()
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')
    mutation.mockRejectedValue(new Error('Connection lost'))
    button?.click()
    await flush()
    const first = mutation.mock.calls[0][1].body
    Object.assign(data.value, { active: { ...oldActive } })
    await flush()
    button?.click()
    await flush()
    expect(mutation.mock.calls[1][1].body).toEqual(first)
    Object.assign(data.value, { active: { ...oldActive, id: '20000000-0000-4000-8000-000000000002' } })
    await flush()
    data.value.currentDigest = 'b'.repeat(64)
    button?.click()
    await flush()
    expect(mutation.mock.calls[2][1].body).toMatchObject({ digest: 'b'.repeat(64), expectedActiveId: '20000000-0000-4000-8000-000000000002' })
    expect(mutation.mock.calls[2][1].body.idempotencyKey).not.toBe(first.idempotencyKey)
  })

  it('retries an uncertain response with the same saved request identity', async () => {
    const host = await mount()
    mutation.mockRejectedValue(new Error('Connection lost'))
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')
    button?.click()
    await flush()
    button?.click()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(mutation.mock.calls[0][1].body).toEqual(mutation.mock.calls[1][1].body)
  })
})
