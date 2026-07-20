// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import { readFileSync } from 'node:fs'
import WorkspaceSendPanel from '~~/app/components/send/WorkspaceSendPanel.vue'

Object.assign(globalThis, { computed, ref, watch })

const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /><slot name="footer" /></section>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: {
    props: ['disabled', 'loading', 'type'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :type="type || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' }
}

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountPanel(fetchMock: ReturnType<typeof vi.fn>) {
  ;(globalThis as { $fetch?: unknown }).$fetch = fetchMock
  ;(globalThis as { useToast?: unknown }).useToast = () => ({ add: vi.fn() })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(WorkspaceSendPanel) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

const transfer = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: null,
  clientId: null,
  projectId: null,
  status: 'draft',
  version: 1,
  title: 'Campaign assets',
  message: null,
  passwordProtected: false,
  maxDownloads: 100,
  fileCount: 0,
  totalBytes: 0,
  recipientCount: 2,
  expiresAt: '2026-07-28T00:00:00.000Z',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z'
}

const policy = {
  defaultRetentionDays: 7,
  maxRetentionDays: 30,
  maxRecipients: 20,
  maxDownloads: 100,
  maxTransferBytes: 2147483648,
  maxFileBytes: 2147483648,
  maxFiles: 20
}

describe('WorkspaceSendPanel', () => {
  it('renders an accessible empty state', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/agency/clients'
      ? []
      : { transfers: [], page: 1, pageSize: 25, hasMore: false, policy })
    const { app, host } = mountPanel(fetchMock)
    await flushUi()

    expect(host.querySelector('[data-testid="send-list-empty"]')).toBeTruthy()
    expect(host.textContent).toContain('No transfers yet')
    expect(host.querySelector('label[for="send-title"]')).toBeTruthy()
    app.unmount()
    host.remove()
  })

  it('renders permitted transfer list rows', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/agency/clients'
      ? []
      : { transfers: [transfer], page: 1, pageSize: 25, hasMore: false, policy })
    const { app, host } = mountPanel(fetchMock)
    await flushUi()

    expect(host.querySelector('[data-testid="send-list"]')).toBeTruthy()
    expect(host.textContent).toContain('Campaign assets')
    expect(host.textContent).toContain('2 recipients')
    app.unmount()
    host.remove()
  })

  it('surfaces create failures in an assertive error region', async () => {
    const fetchMock = vi.fn(async (url: string, options?: { method?: string }) => {
      if (url === '/api/agency/clients') return []
      if (options?.method === 'POST') {
        throw { data: { statusMessage: 'Client scope is not available' } }
      }
      return { transfers: [], page: 1, pageSize: 25, hasMore: false, policy }
    })
    const { app, host } = mountPanel(fetchMock)
    await flushUi()
    const title = host.querySelector<HTMLInputElement>('[data-testid="send-title"]')!
    title.value = 'Campaign assets'
    title.dispatchEvent(new Event('input'))
    host.querySelector<HTMLFormElement>('[data-testid="send-draft-form"]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushUi()

    const error = host.querySelector('[data-testid="send-creation-error"]')
    expect(error?.getAttribute('aria-live')).toBe('assertive')
    expect(error?.textContent).toContain('Client scope is not available')
    app.unmount()
    host.remove()
  })

  it('keeps the route disabled by default at the client boundary', () => {
    const page = readFileSync('app/pages/agency/send/index.vue', 'utf8')
    expect(page).toContain('config.public.sendEnabled !== true')
    expect(page).toContain('statusCode: 404')
  })
})
