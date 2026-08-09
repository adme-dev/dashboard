// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

Object.assign(globalThis, { computed, inject, onBeforeUnmount, onMounted, ref, watch })

const UCommandPalette = defineComponent({
  props: {
    searchTerm: { type: String, default: '' },
    loading: Boolean,
    placeholder: String,
    groups: { type: Array, default: () => [] }
  },
  emits: ['update:searchTerm'],
  setup(props, { emit, slots, attrs }) {
    return () => h('section', {
      'aria-busy': attrs['aria-busy'],
      'data-loading': String(props.loading)
    }, [
      h('input', {
        'aria-label': props.placeholder,
        'value': props.searchTerm,
        'onInput': (event: Event) => emit('update:searchTerm', (event.target as HTMLInputElement).value)
      }),
      ...(props.groups as Array<{ items: Array<{ label: string }> }>).flatMap(group =>
        group.items.map(item => h('span', item.label))),
      slots.empty?.()
    ])
  }
})

const stubs = {
  UButton: { props: ['label'], template: '<button type="button">{{ label }}<slot /><slot name="trailing" /></button>' },
  UKbd: { template: '<kbd />' },
  UModal: { template: '<div><slot name="content" /></div>' },
  UCommandPalette
}

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mountSearch(
  fetchMock: ReturnType<typeof vi.fn>,
  apiBase = '/api/crm',
  initialClientId = CLIENT_ID
) {
  Object.assign(globalThis, { $fetch: fetchMock })
  const Search = (await import('~~/app/components/crm/GlobalSearch.client.vue')).default
  const host = document.createElement('div')
  const clientId = ref(initialClientId)
  const app = createApp({ render: () => h(Search, { clientId: clientId.value }) })
  app.provide('crmApiBase', apiBase)
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, clientId, host }
}

function typeSearch(host: HTMLElement, value: string) {
  const input = host.querySelector('input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('CRM global search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('sends agency search text only in an explicit JSON POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ results: [] })
    const { app, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, '  Acme  ')
      await nextTick()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/crm/search', {
        method: 'POST',
        body: { clientId: CLIENT_ID, query: 'Acme' }
      })
      expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('query')
      expect(host.textContent).toContain('No matches.')
    } finally {
      app.unmount()
    }
  })

  it('derives portal scope from the session by omitting clientId from the POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ results: [] })
    const { app, host } = await mountSearch(fetchMock, '/api/client-portal/crm')
    try {
      typeSearch(host, 'Acme')
      await nextTick()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/client-portal/crm/search', {
        method: 'POST',
        body: { query: 'Acme' }
      })
    } finally {
      app.unmount()
    }
  })

  it('announces bounded loading and generic request errors accessibly', async () => {
    let rejectRequest!: (reason?: unknown) => void
    const fetchMock = vi.fn(() => new Promise((_resolve, reject) => {
      rejectRequest = reject
    }))
    const { app, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await nextTick()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
      expect(host.textContent).toContain('Searching CRM…')

      rejectRequest(new Error('secret database detail'))
      await flushUi()
      const alert = host.querySelector('[role="alert"]')
      expect(alert?.textContent).toContain('CRM search is unavailable. Try again.')
      expect(host.textContent).not.toContain('secret database detail')
    } finally {
      app.unmount()
    }
  })

  it('invalidates an in-flight response immediately when the raw term changes during debounce', async () => {
    const oldRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn().mockReturnValue(oldRequest.promise)
    const { app, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      typeSearch(host, 'Beta')
      await nextTick()
      oldRequest.resolve({
        results: [{ type: 'company', id: 'old', title: 'Old Acme result', subtitle: null, rank: 1 }]
      })
      await flushUi()

      expect(host.textContent).not.toContain('Old Acme result')
      expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('invalidates an in-flight response immediately when search is cleared', async () => {
    const oldRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn().mockReturnValue(oldRequest.promise)
    const { app, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      typeSearch(host, '')
      await nextTick()
      oldRequest.resolve({
        results: [{ type: 'company', id: 'old', title: 'Cleared stale result', subtitle: null, rank: 1 }]
      })
      await flushUi()

      expect(host.textContent).not.toContain('Cleared stale result')
      expect(host.textContent).toContain('Type to search this client’s CRM.')
      expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('invalidates the old client response and searches the current term in the new client scope', async () => {
    const oldRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const newRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise)
    const { app, clientId, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      clientId.value = '22222222-2222-4222-8222-222222222222'
      await flushUi()
      expect(fetchMock).toHaveBeenLastCalledWith('/api/crm/search', {
        method: 'POST',
        body: { clientId: '22222222-2222-4222-8222-222222222222', query: 'Acme' }
      })

      oldRequest.resolve({
        results: [{ type: 'company', id: 'old', title: 'Old client result', subtitle: null, rank: 1 }]
      })
      await flushUi()
      expect(host.textContent).not.toContain('Old client result')

      newRequest.resolve({
        results: [{ type: 'company', id: 'new', title: 'New client result', subtitle: null, rank: 1 }]
      })
      await flushUi()
      expect(host.textContent).toContain('New client result')
    } finally {
      app.unmount()
    }
  })

  it('keeps combined raw-term and client generations isolated', async () => {
    const initialRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const oldDebouncedClientRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const currentRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(oldDebouncedClientRequest.promise)
      .mockReturnValueOnce(currentRequest.promise)
    const { app, clientId, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      typeSearch(host, 'Beta')
      clientId.value = '22222222-2222-4222-8222-222222222222'
      await flushUi()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()
      expect(fetchMock).toHaveBeenCalledTimes(3)

      oldDebouncedClientRequest.resolve({
        results: [{ type: 'company', id: 'stale', title: 'Wrong combined generation', subtitle: null, rank: 1 }]
      })
      await flushUi()
      expect(host.textContent).not.toContain('Wrong combined generation')

      currentRequest.resolve({
        results: [{ type: 'company', id: 'current', title: 'Current combined result', subtitle: null, rank: 1 }]
      })
      await flushUi()
      expect(host.textContent).toContain('Current combined result')
    } finally {
      app.unmount()
    }
  })

  it('keeps a combined clear and client change ahead of old debounced settlement', async () => {
    const initialRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const oldDebouncedClientRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(oldDebouncedClientRequest.promise)
    const { app, clientId, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      typeSearch(host, '')
      clientId.value = '22222222-2222-4222-8222-222222222222'
      await flushUi()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      oldDebouncedClientRequest.resolve({
        results: [{ type: 'company', id: 'stale', title: 'Result after combined clear', subtitle: null, rank: 1 }]
      })
      await flushUi()
      expect(host.textContent).not.toContain('Result after combined clear')
      expect(host.textContent).toContain('Type to search this client’s CRM.')
      expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('does not let an old request settlement stop a newer request loading state', async () => {
    const initialRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const oldDebouncedClientRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const currentRequest = deferred<{ results: Array<Record<string, unknown>> }>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(oldDebouncedClientRequest.promise)
      .mockReturnValueOnce(currentRequest.promise)
    const { app, clientId, host } = await mountSearch(fetchMock)
    try {
      typeSearch(host, 'Acme')
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      typeSearch(host, 'Beta')
      clientId.value = '22222222-2222-4222-8222-222222222222'
      await flushUi()
      await vi.advanceTimersByTimeAsync(250)
      await flushUi()

      oldDebouncedClientRequest.resolve({ results: [] })
      await flushUi()
      expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()

      currentRequest.resolve({ results: [] })
      await flushUi()
      expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })
})
