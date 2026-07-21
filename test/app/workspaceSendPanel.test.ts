// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import { readFileSync } from 'node:fs'
import WorkspaceSendPanel from '~~/app/components/send/WorkspaceSendPanel.vue'

Object.assign(globalThis, { computed, ref, watch })

const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /><slot name="footer" /></section>' },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: { props: ['description'], template: '<div role="alert">{{ description }}<slot /><slot name="description" /></div>' },
  UFormField: { props: ['label', 'name'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UInput: {
    props: ['modelValue', 'type'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="content" /></div>' },
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
  recipientCount: 0,
  expiresAt: '2026-07-28T00:00:00.000Z',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z'
}

const policy = {
  defaultRetentionDays: 7,
  maxRetentionDays: 30,
  maxRecipients: 0,
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
    expect(host.querySelector('[data-testid="send-title"]')).toBeTruthy()
    expect(host.textContent).toContain('Internal workspace')
    expect(host.textContent).not.toMatch(/recipient|password/i)
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
    expect(host.textContent).toContain('0 files')
    expect(host.textContent).not.toContain('recipients')
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

  it('offers a bounded expiry extension for a manageable active transfer', async () => {
    const detail = {
      ...transfer,
      status: 'ready',
      version: 3,
      files: [],
      downloadCount: 0,
      canManage: true,
      canPublish: false,
      publishAvailableAt: null
    }
    const fetchMock = vi.fn(async (url: string, options?: { method?: string, body?: unknown }) => {
      if (url === '/api/agency/clients') return []
      if (url === `/api/agency/send/${transfer.id}`) return { transfer: detail }
      if (url === `/api/agency/send/${transfer.id}/expiry` && options?.method === 'PATCH') {
        return { transfer: { ...detail, version: 4, expiresAt: '2026-08-20T00:00:00.000Z' } }
      }
      return { transfers: [detail], page: 1, pageSize: 25, hasMore: false, policy }
    })
    const { app, host } = mountPanel(fetchMock)
    await flushUi()
    ;[...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Open')?.click()
    await flushUi()

    const extend = [...host.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Extend expiry')
    expect(extend).toBeTruthy()
    extend?.click()
    await flushUi()
    expect(host.textContent).toContain('Extend this transfer?')

    ;[...host.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Extend transfer')?.click()
    await flushUi()

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agency/send/${transfer.id}/expiry`,
      expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({
          expectedVersion: 3,
          expiresAt: '2026-08-04T00:00:00.000Z'
        })
      })
    )
    app.unmount()
    host.remove()
  })

  it('refreshes the manifest when a single-part upload sealing window ends', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T02:00:00.000Z'))
    let detailReads = 0
    const sealingDetail = {
      ...transfer,
      status: 'uploading',
      version: 2,
      files: [{
        id: '55555555-5555-4555-8555-555555555555',
        fileName: 'campaign.pdf',
        state: 'quarantined',
        size: 1024,
        contentType: 'application/pdf',
        uploadedAt: '2026-07-21T01:59:59.000Z'
      }],
      downloadCount: 0,
      canManage: true,
      canPublish: false,
      publishAvailableAt: '2026-07-21T02:00:01.000Z'
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/agency/clients') return []
      if (url === `/api/agency/send/${transfer.id}`) {
        detailReads += 1
        return {
          transfer: detailReads === 1
            ? sealingDetail
            : { ...sealingDetail, canPublish: true, publishAvailableAt: null }
        }
      }
      return { transfers: [sealingDetail], page: 1, pageSize: 25, hasMore: false, policy }
    })
    const { app, host } = mountPanel(fetchMock)
    try {
      await flushUi()
      ;[...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Open')?.click()
      await flushUi()

      const publish = [...host.querySelectorAll('button')]
        .find(button => button.textContent?.trim() === 'Publish internally')
      expect(publish?.disabled).toBe(true)

      await vi.advanceTimersByTimeAsync(1_500)
      await flushUi()

      expect(detailReads).toBe(2)
      const refreshedPublish = [...host.querySelectorAll('button')]
        .find(button => button.textContent?.trim() === 'Publish internally')
      expect(refreshedPublish?.disabled).toBe(false)
    } finally {
      app.unmount()
      host.remove()
      vi.useRealTimers()
    }
  })

  it('keeps the route disabled by default at the client boundary', () => {
    const page = readFileSync('app/pages/agency/send/index.client.vue', 'utf8')
    expect(page).toContain('config.public.sendEnabled !== true')
    expect(page).toContain('statusCode: 404')
  })
})
