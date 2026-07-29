// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import EmailIngestionHistory from '~~/app/components/leads/EmailIngestionHistory.vue'

const fetchMock = vi.fn()
const toastAdd = vi.fn()

Object.assign(globalThis, {
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAdd })
})

async function flush() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountHistory() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(EmailIngestionHistory, {
      endpointId: '33333333-3333-4333-8333-333333333333'
    })
  })
  app.component('UAlert', {
    props: ['title', 'description'],
    template: '<div role="alert">{{ title }} {{ description }}</div>'
  })
  app.component('UBadge', {
    props: ['label'],
    template: '<span>{{ label }}</span>'
  })
  app.component('UButton', {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
  })
  app.mount(host)
  return { app, host }
}

describe('email ingestion recovery history', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return { ok: true, status: 'accepted' }
      return {
        items: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            status: 'quarantined',
            reason: 'Evidence could not be decrypted',
            replay_available: true,
            replay_unavailable_reason: null,
            attempt_count: 2,
            next_attempt_at: null,
            terminal_at: '2026-07-29T01:00:00.000Z',
            created_at: '2026-07-29T00:00:00.000Z',
            updated_at: '2026-07-29T01:00:00.000Z'
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'accepted',
            reason: null,
            replay_available: false,
            replay_unavailable_reason: 'Already processed',
            attempt_count: 1,
            next_attempt_at: null,
            terminal_at: '2026-07-29T02:00:00.000Z',
            created_at: '2026-07-29T01:30:00.000Z',
            updated_at: '2026-07-29T02:00:00.000Z'
          }
        ],
        nextCursor: null
      }
    })
  })

  it('renders safe reasons and disables unavailable replays', async () => {
    const { app, host } = mountHistory()
    await flush()

    expect(host.textContent).toContain('Evidence could not be decrypted')
    expect(host.textContent).toContain('Already processed')
    const buttons = [...host.querySelectorAll('button')]
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.disabled).toBe(false)
    expect(buttons[1]?.disabled).toBe(true)
    expect(host.textContent).not.toContain('sender')
    expect(host.textContent).not.toContain('parser')
    app.unmount()
  })

  it('replays a retained ingestion and refreshes its history', async () => {
    const { app, host } = mountHistory()
    await flush()
    ;(host.querySelector('button') as HTMLButtonElement).click()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/leads/email-ingestions/44444444-4444-4444-8444-444444444444/replay',
      { method: 'POST' }
    )
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Replay completed',
      color: 'success'
    }))
    expect(fetchMock.mock.calls.filter(([url, options]) =>
      String(url).includes('/ingestions') && options?.method !== 'POST'
    )).toHaveLength(2)
    app.unmount()
  })
})
