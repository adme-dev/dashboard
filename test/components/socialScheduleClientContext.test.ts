// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import Calendar from '~~/app/components/social-publishing/CalendarView.vue'
import Planner from '~~/app/components/social-publishing/PlannerBoard.vue'

let app: ReturnType<typeof createApp>
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const post = (content: string, client = 'news') => {
  const now = new Date()
  // Keep fixtures visible in this month and away from the first drop target.
  const createdAt = new Date(now.getFullYear(), now.getMonth(), 15, 12).toISOString()
  return { id: content, client_id: client, content, status: 'draft', lane: 'draft', created_at: createdAt, scheduled_at: null }
}

async function mount(kind: 'calendar' | 'planner', handler: (url: string, options: any) => any) {
  const route = reactive({ query: { client: 'news' } as Record<string, unknown> })
  const selected = ref('news')
  const fetch = vi.fn((url: string, options?: any) => Promise.resolve(handler(url, options)))
  Object.assign(globalThis, { computed, ref, watch, watchEffect, $fetch: fetch,
    useRoute: () => route, useCookie: () => ref('news'), useRouter: () => ({ replace: ({ query }: any) => { route.query = query } }),
    useFetch: () => ({ data: ref([{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }]) }),
    useToast: () => ({ add: vi.fn() }), navigateTo: vi.fn() })
  app = createApp({ render: () => kind === 'calendar' ? h(Calendar) : h(Planner, { clientId: selected.value }) })
  app.config.warnHandler = () => {}
  app.component('SocialPublishingShell', { render() { return h('div', [this.$slots.actions?.(), this.$slots.default?.()]) } })
  app.component('SocialPublishingPlannerCard', { props: ['post'], emits: ['dragstart', 'open'], render() {
    return h('a', { 'data-post': this.post.id, draggable: true, onDragstart: (e: DragEvent) => this.$emit('dragstart', e, this.post) }, this.post.content)
  } })
  app.component('NuxtLink', { render() { return h('a', this.$attrs, this.$slots.default?.()) } })
  for (const name of ['UBadge', 'UButton', 'USwitch', 'USelectMenu']) app.component(name, { render() { return h('span', this.$slots.default?.()) } })
  const root = document.createElement('div'); document.body.append(root); app.mount(root); await flush()
  const change = async (id: string | null) => { selected.value = id || ''; route.query = { client: id || 'unknown' }; await flush() }
  const drag = () => { const link = root.querySelector('a[draggable="true"]')!; link.dispatchEvent(new Event('dragstart')); return kind === 'calendar' ? root.querySelectorAll('.min-h-28')[1]! : root.querySelectorAll('.w-72')[1]! }
  return { root, fetch, change, drag }
}

describe('Calendar client context', () => {
  it('clears the previous client posts and approvals when the selection becomes invalid', async () => {
    const { root, change } = await mount('calendar', url => url.endsWith('/calendar') ? [post('News copy')] : { count: 3 })
    expect(root.textContent).toContain('News copy')
    expect(root.textContent).toContain('3 awaiting approval')
    await change(null)
    expect(root.textContent).not.toContain('News copy')
    expect(root.textContent).not.toContain('awaiting approval')
  })

  it('ignores old calendar responses after switching away and back, and uses the captured client for approvals', async () => {
    const pending: Array<ReturnType<typeof deferred<any[]>>> = []
    const { root, change, fetch } = await mount('calendar', (url) => {
      if (url.endsWith('/calendar')) { const request = deferred<any[]>(); pending.push(request); return request.promise }
      return { count: 0 }
    })
    await change('adme'); await change('news')
    pending[2]!.resolve([post('Current News')]); await flush()
    pending[0]!.resolve([post('Old News')]); pending[1]!.resolve([post('ADME copy', 'adme')]); await flush()
    expect(root.textContent).toContain('Current News')
    expect(root.textContent).not.toContain('Old News')
    expect(root.textContent).not.toContain('ADME copy')
    // The approvals read begins in the same client scope as its calendar read.
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/approvals/badge')).map(([, options]) => options.query.clientId)).toEqual(['news', 'adme', 'news'])
  })

  it('cannot reschedule a held old-client drag after changing clients', async () => {
    const pending = deferred<any[]>()
    const { root, fetch, change, drag } = await mount('calendar', (url, options) => url.endsWith('/calendar') ? options.query.clientId === 'news' ? [post('News drag')] : pending.promise : { count: 0 })
    const target = drag(); await change('adme')
    expect(root.textContent).not.toContain('News drag')
    target.dispatchEvent(new Event('drop')); await flush()
    expect(fetch.mock.calls.some(([, options]) => options?.method)).toBe(false)
    pending.resolve([]); await flush()
  })
})

describe('Planner client context', () => {
  it('ignores old board responses after switching away and back, and clears on empty selection', async () => {
    const pending: Array<ReturnType<typeof deferred<any[]>>> = []
    const { root, change } = await mount('planner', url => {
      if (url.endsWith('/board')) { const request = deferred<any[]>(); pending.push(request); return request.promise }
      return []
    })
    await change('adme'); await change('news')
    pending[2]!.resolve([post('Current News')]); await flush()
    pending[0]!.resolve([post('Old News')]); pending[1]!.resolve([post('ADME copy', 'adme')]); await flush()
    expect(root.textContent).toContain('Current News')
    expect(root.textContent).not.toContain('Old News')
    expect(root.textContent).not.toContain('ADME copy')
    await change(null)
    expect(root.textContent).not.toContain('Current News')
  })

  it('cannot move a held old-client drag after changing clients', async () => {
    const pending = deferred<any[]>()
    const { fetch, change, drag } = await mount('planner', (url, options) => url.endsWith('/board') ? options.query.clientId === 'news' ? [post('News drag')] : pending.promise : [])
    const target = drag(); await change('adme')
    target.dispatchEvent(new Event('drop')); await flush()
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    pending.resolve([]); await flush()
  })

  it('does not restore old posts when an old-client lane mutation fails after a switch', async () => {
    const mutation = deferred<any>()
    const { root, fetch, change, drag } = await mount('planner', (url, options) => {
      if (options?.method === 'POST') return mutation.promise
      return url.endsWith('/board') ? [post(options.query.clientId === 'news' ? 'News moving' : 'ADME current', options.query.clientId)] : []
    })
    drag().dispatchEvent(new Event('drop')); await flush()
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true)
    await change('adme')
    expect(root.textContent).toContain('ADME current')
    mutation.reject(new Error('Old mutation failed')); await flush()
    expect(root.textContent).toContain('ADME current')
    expect(root.textContent).not.toContain('News moving')
  })
})

describe.each(['calendar', 'planner'] as const)('%s loaded-client mutation gate', kind => {
  it('keeps old content cleared and a held drag blocked after the new client fails to load', async () => {
    const pending = deferred<any[]>()
    const endpoint = kind === 'calendar' ? '/calendar' : '/board'
    const { root, fetch, change, drag } = await mount(kind, (url, options) => {
      if (url.endsWith(endpoint)) return options.query.clientId === 'news' ? [post('Previous News')] : pending.promise
      return kind === 'calendar' ? { count: 2 } : []
    })
    const target = drag(); await change('adme')
    pending.reject(new Error('New client unavailable')); await flush()
    expect(root.textContent).not.toContain('Previous News')
    target.dispatchEvent(new Event('drop')); await flush()
    expect(fetch.mock.calls.some(([, options]) => options?.method)).toBe(false)
  })

  it('still permits the loaded current client to move its own post', async () => {
    const endpoint = kind === 'calendar' ? '/calendar' : '/board'
    const { fetch, drag } = await mount(kind, (url) => {
      if (url.endsWith(endpoint)) return [post('Current News drag')]
      return kind === 'calendar' ? { count: 0 } : []
    })
    drag().dispatchEvent(new Event('drop')); await flush()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/posts/Current News drag'), expect.objectContaining({ method: kind === 'calendar' ? 'PATCH' : 'POST' }))
  })
})

it('does not reload the new calendar after an old-client reschedule fails', async () => {
  const mutation = deferred<any>()
  const { root, fetch, change, drag } = await mount('calendar', (url, options) => {
    if (options?.method === 'PATCH') return mutation.promise
    if (url.endsWith('/calendar')) return [post(options.query.clientId === 'news' ? 'News moving' : 'ADME current', options.query.clientId)]
    return { count: 0 }
  })
  drag().dispatchEvent(new Event('drop')); await flush()
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true)
  await change('adme')
  mutation.reject(new Error('Old mutation failed')); await flush()
  expect(root.textContent).toContain('ADME current')
  expect(root.textContent).not.toContain('News moving')
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/calendar'))).toHaveLength(2)
})
