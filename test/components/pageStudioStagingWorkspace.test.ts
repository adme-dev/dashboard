// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, onUnmounted, ref, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/StagingWorkspace.client.vue'
import { pageStudioStagingAddress } from '~~/shared/pageStudio/staging'

const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const initial = () => ({ siteId, ...pageStudioStagingAddress(siteId), status: 'not_published', canManage: true, active: null, currentDigest: 'a'.repeat(64), failure: null })
const data = ref(initial()), error = ref<unknown>(null), pending = ref(false)
const mutation = vi.fn(), refresh = vi.fn(), notify = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const scope = ref({ siteId, audience: 'portal' })
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(keepInitialCalls = false) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, scope.value) }) })
  app.component('UCard', { template: '<section><slot name="header"/><slot/><slot name="footer"/></section>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p>{{title}} {{description}}</p>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading', 'to'], emits: ['click'], template: '<a v-if="to" :href="to">{{label}}</a><button v-else :disabled="disabled || loading" @click="$emit(\'click\')">{{label}}</button>' })
  apps.push(app)
  app.mount(host)
  await flush()
  if (!keepInitialCalls) mutation.mockClear()
  return host
}
beforeEach(() => {
  vi.resetAllMocks()
  mutation.mockImplementation(async () => initial())
  scope.value = { siteId, audience: 'portal' }
  data.value = initial()
  error.value = null
  pending.value = false
  Object.entries({ computed, ref, watch, onMounted, onUnmounted }).forEach(([name, value]) => vi.stubGlobal(name, value))
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

describe('initial customer preview', () => {
  it('requests the first saved preview once and does not repeat it when the draft changes', async () => {
    await mount(true)
    expect(mutation).toHaveBeenCalledExactlyOnceWith(`/api/portal/page-studio/sites/${siteId}/staging/ensure`, { method: 'POST', body: {} })
    data.value.currentDigest = 'b'.repeat(64)
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
  })
  it('preserves an existing snapshot without requesting another build', async () => {
    Object.assign(data.value, { status: 'ready', active: { id: '20000000-0000-4000-8000-000000000001', checkpointId: 'saved', digest: initial().currentDigest, deployedAt: '2026-09-22T00:00:00.000Z' } })
    const host = await mount(true)
    expect(mutation).not.toHaveBeenCalled()
    expect(host.querySelector('a')?.href).toBe(initial().url)
  })
  it('checks an uncertain initial request before allowing a fresh explicit update', async () => {
    mutation.mockRejectedValueOnce(new Error('Response lost'))
    const host = await mount(true)
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Check initial staging')
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Check initial staging')?.click()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(mutation.mock.calls.every(([url]) => url.endsWith('/ensure'))).toBe(true)
  })
})

describe('initial preview boundaries', () => {
  it.each([
    { canManage: false },
    { status: 'suspended' },
    { status: 'failed', failure: 'HOST_UNAVAILABLE' },
    { status: 'building' }
  ])('does not automatically retry or write without current editable first-use state: %j', async (override) => {
    Object.assign(data.value, override)
    await mount(true)
    expect(mutation).not.toHaveBeenCalled()
  })
  it('reserves an empty site and requests its first saved checkpoint once', async () => {
    Object.assign(data.value, { currentDigest: null })
    mutation.mockResolvedValueOnce({ ...initial(), currentDigest: null })
    const host = await mount(true)
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Save a page')
    expect(host.querySelector('a')).toBeNull()
    data.value.currentDigest = 'b'.repeat(64)
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
    data.value.currentDigest = 'c'.repeat(64)
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
  })
  it('does not loop after the allowance is exhausted', async () => {
    mutation.mockRejectedValueOnce({ statusCode: 429 })
    await mount(true)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Monthly build allowance reached' }))
    data.value = { ...initial(), currentDigest: 'b'.repeat(64) }
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
  })
  it('ignores a successful response after editing permission is revoked', async () => {
    let complete!: (value: unknown) => void
    mutation.mockReturnValueOnce(new Promise((resolve) => {
      complete = resolve
    }))
    const host = await mount(true)
    data.value.canManage = false
    await flush()
    complete({ ...initial(), status: 'ready', active: { id: '20000000-0000-4000-8000-000000000001', checkpointId: 'saved', digest: initial().currentDigest, deployedAt: '2026-09-22T00:00:00.000Z' } })
    await flush()
    expect(data.value.canManage).toBe(false)
    expect(host.querySelector('a')).toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })
  it('ignores late responses from a previous audience and keeps the new request pending', async () => {
    let completeOld!: (value: unknown) => void
    let completeNew!: (value: unknown) => void
    mutation.mockReturnValueOnce(new Promise((resolve) => {
      completeOld = resolve
    }))
    mutation.mockReturnValueOnce(new Promise((resolve) => {
      completeNew = resolve
    }))
    const host = await mount(true)
    scope.value.audience = 'agency'
    await flush()
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(mutation.mock.calls[1][0]).toBe(`/api/agency/page-studio/sites/${siteId}/staging/ensure`)
    completeOld({ ...initial(), status: 'failed', failure: 'HOST_UNAVAILABLE' })
    await flush()
    expect(data.value.failure).toBeNull()
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Check initial staging')
    expect(button?.disabled).toBe(true)
    completeNew(initial())
    await flush()
    expect(host.textContent).toContain('Update staging')
    expect(notify).not.toHaveBeenCalled()
  })
  it('does not apply an unmounted request or notify its replacement page', async () => {
    let complete!: (value: unknown) => void
    mutation.mockReturnValueOnce(new Promise((resolve) => {
      complete = resolve
    }))
    await mount(true)
    apps.pop()!.unmount()
    complete({ ...initial(), status: 'failed', failure: 'HOST_UNAVAILABLE' })
    await flush()
    expect(data.value.failure).toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })
  it('does not notify a replacement page after a conflict refresh finishes', async () => {
    const host = await mount()
    let completeRefresh!: () => void
    refresh.mockReturnValueOnce(new Promise<void>((resolve) => {
      completeRefresh = resolve
    }))
    mutation.mockRejectedValueOnce({ statusCode: 409 })
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Update staging')?.click()
    await flush()
    expect(refresh).toHaveBeenCalledTimes(1)
    apps.pop()!.unmount()
    completeRefresh()
    await flush()
    expect(notify).not.toHaveBeenCalled()
  })
  it('retains a provider failure for explicit recovery without automatic retries', async () => {
    mutation.mockResolvedValueOnce({ ...initial(), status: 'failed', failure: 'HOST_UNAVAILABLE' })
    const host = await mount(true)
    expect(host.textContent).toContain('Staging needs another attempt')
    expect(host.querySelector('a')).toBeNull()
    data.value.currentDigest = 'b'.repeat(64)
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
  })
  it('does not expose a foreign address returned by initial ensure', async () => {
    mutation.mockResolvedValueOnce({ ...initial(), hostname: 'attacker.test', url: 'https://attacker.test/' })
    const host = await mount(true)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toContain('Check initial staging')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
