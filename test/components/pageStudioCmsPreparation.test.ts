// @vitest-environment happy-dom
import { createApp, h, nextTick, reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CmsPreparation from '~~/app/components/page-studio/CmsPreparation.client.vue'

const siteId = '50000000-0000-4000-8000-000000000901'
const fetch = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const idle = {
  phase: 'idle',
  adoptionId: null,
  recoveryId: null,
  recoveryRequired: false,
  recoveryReason: null,
  progress: null,
  progressDigest: 'a'.repeat(64)
}
const physical = new Set<string>()
const stubs = {
  UCard: { template: '<section><slot name="header"/><slot/><slot name="footer"/></section>' },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{label}}</button>'
  },
  UAlert: { props: ['title', 'description'], template: '<div>{{title}} {{description}}</div>' },
  UBadge: { props: ['label'], template: '<span>{{label}}</span>' }
}
async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(audience = 'agency') {
  const props = reactive({ audience, siteId })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(CmsPreparation, props as never) })
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  apps.push(app)
  app.mount(host)
  await flush()
  return { host, props }
}
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find(item => item.textContent === label)!
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  physical.clear()
  vi.stubGlobal('$fetch', fetch)
  fetch.mockImplementation(async (path: string, options: { method: string, body?: unknown }) => {
    if (path.endsWith('content-connection')) return { status: 'connected' }
    if (path.endsWith('cms-adoption')) return idle
    if (options.method === 'POST') {
      physical.add(path)
      return { status: 'installed', canConfigure: true }
    }
    return { status: physical.has(path) ? 'installed' : 'pending', canConfigure: true }
  })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it.each(['agency', 'portal'])(
  'orders physical preparation before adoption with actual %s endpoints and explicit clicks',
  async (audience) => {
    const { host } = await mount(audience)
    expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
    for (const label of ['Prepare collections', 'Prepare content tools', 'Prepare CMS storage']) {
      button(host, label).click()
      await flush()
    }
    const posts = fetch.mock.calls.filter(([, options]) => options.method === 'POST')
    expect(posts.map(([path]) => path)).toEqual(
      ['collections', 'workflows', 'cms-staging'].map(
        step => `/api/${audience}/page-studio/sites/${siteId}/${step}/setup`
      )
    )
    expect(posts.every(([, options]) => Object.keys(options.body).join() === 'requestId')).toBe(
      true
    )
    expect(host.textContent).toContain('Activate CMS')
    expect(
      fetch.mock.calls.filter(
        ([path, options]) => path.endsWith('cms-adoption') && options.method === 'POST'
      )
    ).toHaveLength(0)
  }
)
it('requires explicit status refresh after lost acknowledgement and reuses original physical request', async () => {
  const { host } = await mount()
  fetch.mockRejectedValueOnce(new Error('Lost acknowledgement'))
  button(host, 'Prepare collections').click()
  await flush()
  const posted = fetch.mock.calls.at(-1)
  expect(button(host, 'Prepare collections').disabled).toBe(true)
  button(host, 'Refresh status').click()
  await flush()
  button(host, 'Prepare collections').click()
  await flush()
  expect(fetch.mock.calls.findLast(([, options]) => options.method === 'POST')?.[1].body).toEqual(
    posted?.[1].body
  )
})
it('requires explicit recovery under the new native session', async () => {
  for (const kind of ['collections', 'workflows', 'cms-staging'])
    physical.add(`/api/agency/page-studio/sites/${siteId}/${kind}/setup`)
  fetch.mockImplementation(async (path: string, _options: { method: string }) =>
    path.endsWith('cms-adoption')
      ? {
          ...idle,
          phase: 'freezing',
          adoptionId: 'adoption',
          recoveryRequired: true,
          recoveryReason: 'This sign-in must explicitly resume setup.'
        }
      : {
          status: path.endsWith('content-connection') ? 'connected' : 'installed',
          canConfigure: true
        }
  )
  const { host } = await mount()
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
  button(host, 'Resume with this sign-in').click()
  await flush()
  expect(fetch.mock.calls.find(([, options]) => options.method === 'POST')?.[1].body).toMatchObject(
    {
      action: 'recover',
      adoptionId: 'adoption',
      expectedRecoveryId: null,
      recoveryId: expect.any(String)
    }
  )
})
it('leaves denied or reconciliation-required setup read-only', async () => {
  fetch.mockImplementation(async (path: string) =>
    path.endsWith('cms-adoption')
      ? idle
      : path.endsWith('content-connection')
        ? { status: 'connected' }
        : { status: 'reconciliation', canConfigure: false }
  )
  const { host } = await mount()
  expect(host.textContent).toContain('previous sign-in')
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
  expect(button(host, 'Prepare collections').disabled).toBe(true)
})
it('resumes frozen adoption without hitting the ordinary content read fence', async () => {
  fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('cms-adoption'))
      return {
        ...idle,
        phase: 'importing',
        adoptionId: 'adoption',
        progress: { consumed: 20, done: false }
      }
    throw Object.assign(new Error('Frozen content'), { statusCode: 409 })
  })
  const { host } = await mount()
  expect(host.textContent).toContain('20 saved items')
  expect(fetch).toHaveBeenCalledOnce()
  button(host, 'Continue activation').click()
  await flush()
  expect(fetch.mock.calls.find(([, options]) => options.method === 'POST')?.[1].body).toEqual({
    action: 'advance',
    adoptionId: 'adoption',
    expectedProgressDigest: idle.progressDigest
  })
  expect(fetch.mock.calls.every(([path]) => path.endsWith('cms-adoption'))).toBe(true)
})
it('ignores in-flight results after switching sites and never submits the old target', async () => {
  let done: ((value: unknown) => void) | undefined
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve
      })
  )
  const { host, props } = await mount()
  props.siteId = '50000000-0000-4000-8000-000000000902'
  await flush()
  done?.({ ...idle, phase: 'managed' })
  await flush()
  expect(host.textContent).not.toContain('CMS is ready for')
  button(host, 'Prepare collections').click()
  await flush()
  expect(fetch.mock.calls.find(([, options]) => options.method === 'POST')?.[0]).toContain(
    props.siteId
  )
})
