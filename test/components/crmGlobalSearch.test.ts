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
    placeholder: String
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

async function mountSearch(fetchMock: ReturnType<typeof vi.fn>, apiBase = '/api/crm') {
  Object.assign(globalThis, { $fetch: fetchMock })
  const Search = (await import('~~/app/components/crm/GlobalSearch.client.vue')).default
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Search, { clientId: CLIENT_ID }) })
  app.provide('crmApiBase', apiBase)
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

function typeSearch(host: HTMLElement, value: string) {
  const input = host.querySelector('input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
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
})
