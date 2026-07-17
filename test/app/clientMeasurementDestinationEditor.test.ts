// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ClientMeasurementDestinationEditor from '~~/app/components/clients/ClientMeasurementDestinationEditor.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const stubs = {
  UButton: {
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function select(element: HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function check(element: HTMLInputElement) {
  element.checked = true
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('ClientMeasurementDestinationEditor', () => {
  it('maps an explicit provider destination to a connected account, capability, and qualified event', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { method?: string }) => {
      if (request === '/api/agency/social/meta/accounts') {
        return [
          { id: '33333333-3333-4333-8333-333333333333', accountId: '1768287680458045', accountName: 'Ferntree Gully Automotive', status: 'connected' },
          { id: '66666666-6666-4666-8666-666666666666', accountId: '9999999999999999', accountName: 'Expired Meta Connection', status: 'disconnected' }
        ]
      }
      if (request === '/api/agency/social/google/accounts') {
        return [{ id: '44444444-4444-4444-8444-444444444444', accountId: '1234567890', accountName: 'Ferntree Google Ads', status: 'connected' }]
      }
      if (request.endsWith('/destinations') && options?.method === 'POST') {
        return {
          destination: { id: '55555555-5555-4555-8555-555555555555' },
          profileConfigVersion: 5,
          warnings: [{ code: 'MEASUREMENT_CACHE_STALE' }]
        }
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    Object.assign(globalThis, { $fetch: fetchMock })
    const saved: unknown[] = []

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementDestinationEditor, {
        clientId: CLIENT_ID,
        profileConfigVersion: 4,
        onSaved: (value: unknown) => saved.push(value)
      })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      expect(fetchMock).toHaveBeenCalledWith('/api/agency/social/meta/accounts')
      expect(fetchMock).not.toHaveBeenCalledWith('/api/agency/social/google/accounts')
      expect(host.textContent).toContain('Connected credential source')
      expect(host.textContent).toContain('Ferntree Gully Automotive')
      expect(host.textContent).not.toContain('Expired Meta Connection')
      expect(host.textContent).toContain('Dataset ID')
      expect(host.textContent).toContain('Meta CRM CAPI')
      expect(host.textContent).toContain('Qualified lead')
      expect(host.textContent).toContain('Destination delivery remains dormant')

      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-connection"]')!, '33333333-3333-4333-8333-333333333333')
      input(host.querySelector<HTMLInputElement>('[data-testid="measurement-destination-id"]')!, '573284833843027')
      check(host.querySelector<HTMLInputElement>('[data-testid="capability-meta_crm_capi"]')!)
      check(host.querySelector<HTMLInputElement>('[data-testid="mapping-lead_qualified"]')!)
      await nextTick()
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-event-lead_qualified"]')!, 'QualifiedLead')
      input(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-destination-reason"]')!, 'Map the approved Meta CRM destination for test validation')
      await nextTick()

      const save = host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-destination"]')!
      expect(save.disabled).toBe(false)
      save.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(`/api/agency/measurement/clients/${CLIENT_ID}/destinations`, {
        method: 'POST',
        body: {
          expectedProfileVersion: 4,
          reason: 'Map the approved Meta CRM destination for test validation',
          destination: {
            platform: 'meta',
            socialConnectionId: '33333333-3333-4333-8333-333333333333',
            externalDestinationId: '573284833843027',
            capabilities: [{
              mode: 'meta_crm_capi',
              status: 'configured',
              managementOrigin: 'zero',
              canZeroMutate: true,
              blockingReason: null
            }],
            mappings: [{
              canonicalEventName: 'lead_qualified',
              providerEventName: 'QualifiedLead',
              isActive: true
            }]
          }
        }
      })
      expect(saved).toEqual([expect.objectContaining({
        profileConfigVersion: 5,
        warnings: [{ code: 'MEASUREMENT_CACHE_STALE' }]
      })])
      expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('access_token')
    } finally {
      app.unmount()
    }
  })

  it('ignores a stale provider error after the operator switches accounts', async () => {
    let rejectMeta!: (error: Error) => void
    const pendingMeta = new Promise<unknown[]>((_resolve, reject) => {
      rejectMeta = reject
    })
    const fetchMock = vi.fn(async (request: string) => {
      if (request === '/api/agency/social/meta/accounts') return pendingMeta
      if (request === '/api/agency/social/google/accounts') {
        return [{
          id: '44444444-4444-4444-8444-444444444444',
          accountId: '1234567890',
          accountName: 'Ferntree Google Ads',
          status: 'connected'
        }]
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementDestinationEditor, {
        clientId: CLIENT_ID,
        profileConfigVersion: 4
      })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)

    try {
      select(host.querySelector<HTMLSelectElement>('select')!, 'google_data_manager')
      await flushUi()
      expect(host.textContent).toContain('Ferntree Google Ads')

      rejectMeta(new Error('Stale Meta connection failure'))
      await flushUi()
      expect(host.textContent).not.toContain('Stale Meta connection failure')
      expect(host.textContent).toContain('Ferntree Google Ads')
    } finally {
      app.unmount()
    }
  })
})
