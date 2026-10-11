// @vitest-environment happy-dom
import { createApp, h, nextTick, ref, computed, onBeforeUnmount } from 'vue'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import Setup from '~~/app/components/studio/CustomerCmsSetup.client.vue'
import type { CustomerCmsSetupStatus } from '~~/shared/pageStudio/customerCmsSetup'

const kinds = ['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'] as const
const original = '10000000-0000-4000-8000-000000000001'
const recovery = '20000000-0000-4000-8000-000000000001'
const initial = (): CustomerCmsSetupStatus => ({ resumeRequired: false, prerequisites: kinds.map(kind => ({ kind, status: 'pending', recoveryId: null, canConfigure: true })), adoption: { phase: 'idle', adoptionId: null, progress: null, recoveryId: null, recoveryRequired: false, progressDigest: 'a'.repeat(64) } })
let data = ref(initial()), error = ref<unknown>(null), status = ref('success')
const fetch = vi.fn(), refresh = vi.fn(), useFetch = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{label}}</button>' },
  UAlert: { props: ['title', 'description'], template: '<div>{{title}} {{description}}</div>' }
}
async function flush() {
  for (let i = 0;
    i < 20;
    i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Setup) })
  apps.push(app)
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  app.mount(host)
  await flush()
  refresh.mockClear()
  return host
}
const step = (host: HTMLElement, kind: string) => [...host.querySelectorAll('li')].find(li => li.textContent?.startsWith(kind))!
const click = async (host: HTMLElement, kind: string) => {
  step(host, kind).querySelector('button')!.click()
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  data = ref(initial())
  error = ref(null)
  status = ref('success')
  refresh.mockResolvedValue(undefined)
  useFetch.mockImplementation(() => ({ data, error, status, refresh }))
  for (const [name, value] of Object.entries({ ref, computed, onBeforeUnmount, useFetch, $fetch: fetch })) vi.stubGlobal(name, value)
  fetch.mockImplementation(async (_url, { body }) => ({ kind: body.request.kind, status: 'installed', requestId: body.request.requestId, recoveryId: data.value.prerequisites.find(row => row.kind === body.request.kind)?.recoveryId ?? null, canConfigure: true }))
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('uses the verified schema response without repeating physical status reads', async () => {
  const host = await mount()
  await click(host, 'Content collections')
  expect(step(host, 'Content collections').textContent).toContain('Ready')
  expect(step(host, 'Content tools').textContent).not.toContain('Ready')
  expect(refresh).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledOnce()
})
it('resumes a confirmed reserved step with the exact original request without another preflight', async () => {
  data.value.prerequisites[0] = { kind: 'collection', status: 'reconciliation', requestId: original, recoveryId: null, canConfigure: false }
  fetch.mockImplementationOnce(async (_url, { body }) => ({ kind: 'collection', status: 'reserved', requestId: original, recoveryId: body.request.requestId, canConfigure: true }))
  const host = await mount()
  await click(host, 'Content collections')
  expect(step(host, 'Content collections').textContent).toContain('Resume step')
  await click(host, 'Content collections')
  expect(fetch.mock.calls.at(-1)?.[1].body.request).toEqual({ action: 'start', kind: 'collection', requestId: original })
  expect(refresh).not.toHaveBeenCalled()
})
it.each(['kind', 'requestId', 'extra'])('withholds malformed or mismatched success (%s) and refreshes', async (field) => {
  fetch.mockImplementationOnce(async (_url, { body }) => ({ kind: 'collection', status: 'installed', requestId: body.request.requestId, recoveryId: null, canConfigure: true, ...{ [field]: field === 'extra' ? true : field === 'kind' ? 'workflow' : recovery } }))
  const host = await mount()
  await click(host, 'Content collections')
  expect(step(host, 'Content collections').textContent).not.toContain('Ready')
  expect(refresh).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('could not confirm')
})
it('does not start a mutation while an older status read is pending', async () => {
  const host = await mount()
  status.value = 'pending'
  await flush()
  await click(host, 'Content collections')
  expect(fetch).not.toHaveBeenCalled()
  status.value = 'success'
  await flush()
})
it('does not merge a response after the current snapshot is replaced', async () => {
  let done: (value: unknown) => void = () => {}
  fetch.mockImplementationOnce(() => new Promise((resolve) => {
    done = resolve
  }))
  const host = await mount()
  await click(host, 'Content collections')
  const body = fetch.mock.calls[0]![1].body
  data.value = initial()
  done({ kind: 'collection', status: 'installed', requestId: body.request.requestId, recoveryId: null, canConfigure: true })
  await flush()
  expect(step(host, 'Content collections').textContent).not.toContain('Ready')
  expect(refresh).toHaveBeenCalledOnce()
})
it('ignores a late result after unmount rather than refreshing a new page', async () => {
  let done: (value: unknown) => void = () => {}
  fetch.mockImplementationOnce(() => new Promise((resolve) => {
    done = resolve
  }))
  const host = await mount()
  await click(host, 'Content collections')
  const body = fetch.mock.calls[0]![1].body
  apps.pop()!.unmount()
  done({ kind: 'collection', status: 'installed', requestId: body.request.requestId, recoveryId: null, canConfigure: true })
  await flush()
  expect(refresh).not.toHaveBeenCalled()
})
it('keeps a failed action uncertain and requires fresh status before another explicit resume', async () => {
  data.value.prerequisites[0] = { kind: 'collection', status: 'reserved', requestId: original, recoveryId: null, canConfigure: true }
  fetch.mockRejectedValueOnce(new Error('lost acknowledgement'))
  const host = await mount()
  await click(host, 'Content collections')
  expect(fetch).toHaveBeenCalledOnce()
  refresh.mockClear()
  await click(host, 'Content collections')
  expect(refresh).toHaveBeenCalled()
  expect(fetch.mock.calls.at(-1)?.[1].body.request.requestId).toBe(original)
})

it('rejects a late action reply while another read is in flight, then keeps the read authoritative', async () => {
  let done: (value: unknown) => void = () => {}
  fetch.mockImplementationOnce(() => new Promise((resolve) => {
    done = resolve
  }))
  const host = await mount()
  await click(host, 'Content collections')
  const body = fetch.mock.calls[0]![1].body
  status.value = 'pending'
  done({ kind: 'collection', status: 'installed', requestId: body.request.requestId, recoveryId: null, canConfigure: true })
  await flush()
  expect(step(host, 'Content collections').textContent).not.toContain('Ready')
  data.value = initial()
  status.value = 'success'
  await flush()
  expect(step(host, 'Content collections').textContent).not.toContain('Ready')
  expect(refresh).toHaveBeenCalledWith({ dedupe: 'defer' })
})
it('invalidates the step confirmation on an explicit refresh and rechecks before resume', async () => {
  data.value.prerequisites[0] = { kind: 'collection', status: 'reconciliation', requestId: original, recoveryId: null, canConfigure: false }
  fetch.mockImplementationOnce(async (_url, { body }) => ({ kind: 'collection', status: 'reserved', requestId: original, recoveryId: body.request.requestId, canConfigure: true }))
  const host = await mount()
  await click(host, 'Content collections')
  ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Refresh content setup')!.click()
  await flush()
  refresh.mockClear()
  await click(host, 'Content collections')
  expect(refresh).toHaveBeenCalledOnce()
  expect(fetch.mock.calls.at(-1)?.[1].body.request.requestId).toBe(original)
})
it('advances only confirmed adoption responses without extra reads or inferring capabilities', async () => {
  data.value.prerequisites = data.value.prerequisites.map(row => ({ ...row, status: 'installed', requestId: original }))
  const phases = ['freezing', 'importing', 'ready', 'managed'] as const
  fetch.mockImplementation(async (_url, { body }) => {
    const index = fetch.mock.calls.length - 1
    if (index > 0) expect(body.request.expectedProgressDigest).toBe(String.fromCharCode(96 + index).repeat(64))
    return { phase: phases[index], adoptionId: 'adoption-b', recoveryId: null, recoveryRequired: false, progress: { consumed: index, done: index >= 2 }, progressDigest: String.fromCharCode(97 + index).repeat(64) }
  })
  const host = await mount()
  for (const _phase of phases) {
    await click(host, 'Website content workspace')
  }
  expect(step(host, 'Website content workspace').textContent).toContain('Ready')
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(refresh).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('capability')
})

it('blocks further mutations when uncertain readback fails, then requires an explicit successful refresh', async () => {
  fetch.mockRejectedValueOnce(new Error('lost acknowledgement'))
  refresh.mockRejectedValueOnce(new Error('readback unavailable'))
  const host = await mount()
  await click(host, 'Content collections')
  expect(step(host, 'Content collections').querySelector('button')!.disabled).toBe(true)
  await click(host, 'Content collections')
  expect(fetch).toHaveBeenCalledOnce()
  const refreshButton = [...host.querySelectorAll('button')].find(button => button.textContent === 'Refresh content setup')!
  refreshButton.click()
  await flush()
  expect(step(host, 'Content collections').querySelector('button')!.disabled).toBe(false)
})

it('withholds a POST reply if a concurrent GET has settled with an error on the same snapshot', async () => {
  let done: (value: unknown) => void = () => {}
  fetch.mockImplementationOnce(() => new Promise((resolve) => {
    done = resolve
  }))
  const host = await mount()
  await click(host, 'Content collections')
  const body = fetch.mock.calls[0]![1].body
  error.value = new Error('concurrent GET failed')
  status.value = 'error'
  done({ kind: 'collection', status: 'installed', requestId: body.request.requestId, recoveryId: null, canConfigure: true })
  await flush()
  expect(step(host, 'Content collections').textContent).not.toContain('Ready')
  expect(refresh).toHaveBeenCalledWith({ dedupe: 'defer' })
  expect(host.textContent).toContain('could not confirm')
})
