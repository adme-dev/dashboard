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
  },
  UFormField: {
    props: ['label', 'help', 'required'],
    template: '<label><span>{{ label }}</span><slot /><span v-if="help">{{ help }}</span></label>'
  },
  USelect: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'disabled', 'placeholder', 'valueKey'],
    emits: ['update:modelValue'],
    template: `<select v-bind="$attrs" :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value)">
      <option v-if="placeholder" value="">{{ placeholder }}</option>
      <option v-for="item in items" :key="item[valueKey || 'value']" :value="item[valueKey || 'value']">{{ item.label }}</option>
    </select>`
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UCheckbox: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">'
  },
  UTextarea: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
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
      expect(host.textContent).toContain('Phone click')
      expect(host.textContent).toContain('Directions click')
      check(host.querySelector<HTMLInputElement>('[data-testid="mapping-web_conversion"]')!)
      await nextTick()
      expect(host.textContent).toContain('Service booking')
      const websiteMapping = host.querySelector<HTMLInputElement>('[data-testid="mapping-web_conversion"]')!
      websiteMapping.checked = false
      websiteMapping.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()
      expect(host.textContent).toContain('Destination delivery remains dormant')

      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-connection"]')!, '33333333-3333-4333-8333-333333333333')
      input(host.querySelector<HTMLInputElement>('[data-testid="measurement-destination-id"]')!, '573284833843027')
      input(host.querySelector<HTMLInputElement>('[data-testid="measurement-credential-ref"]')!, 'MEASUREMENT_PROVIDER_META_FERNTREE')
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
            credentialRef: 'MEASUREMENT_PROVIDER_META_FERNTREE',
            capabilities: [{
              mode: 'meta_crm_capi',
              status: 'configured',
              managementOrigin: 'zero',
              canZeroMutate: true,
              blockingReason: null
            }],
            mappings: [{
              canonicalEventName: 'lead_qualified',
              enquiryType: null,
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

  it('loads eligible actions from the selected Google account and stores the numeric Data Manager destination ID', async () => {
    const googleConnectionId = '44444444-4444-4444-8444-444444444444'
    const fetchMock = vi.fn(async (request: string, options?: { method?: string, body?: unknown }) => {
      if (request === '/api/agency/social/meta/accounts') return []
      if (request === '/api/agency/social/google/accounts') {
        return [{
          id: googleConnectionId,
          accountId: '3584435581',
          accountName: 'Courtney & Patterson Ford',
          status: 'active'
        }]
      }
      if (request === `/api/agency/measurement/clients/${CLIENT_ID}/google-conversion-actions?connectionId=${googleConnectionId}&page=1&pageSize=100`) {
        return {
          connection: {
            id: googleConnectionId,
            accountId: '3584435581',
            accountName: 'Courtney & Patterson Ford'
          },
          items: [
            {
              id: '9001',
              resourceName: 'customers/3584435581/conversionActions/9001',
              name: 'XeroFlow website lead',
              status: 'ENABLED',
              type: 'UPLOAD_CLICKS',
              category: 'SUBMIT_LEAD_FORM',
              origin: 'WEBSITE',
              isPrimary: false,
              includesInConversions: true,
              deliveryMode: 'offline_click'
            },
            {
              id: '9002',
              resourceName: 'customers/3584435581/conversionActions/9002',
              name: 'Legacy browser lead',
              status: 'ENABLED',
              type: 'WEBPAGE',
              category: 'SUBMIT_LEAD_FORM',
              origin: 'WEBSITE',
              isPrimary: true,
              includesInConversions: true,
              deliveryMode: 'additional_data_source'
            }
          ],
          pagination: { page: 1, pageSize: 100, hasNextPage: false }
        }
      }
      if (request.endsWith('/destinations') && options?.method === 'POST') {
        return {
          destination: { id: '55555555-5555-4555-8555-555555555555' },
          profileConfigVersion: 5,
          warnings: []
        }
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
    await flushUi()

    try {
      select(host.querySelector<HTMLSelectElement>('select')!, 'google_data_manager')
      await flushUi()
      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-connection"]')!, googleConnectionId)
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agency/measurement/clients/${CLIENT_ID}/google-conversion-actions?connectionId=${googleConnectionId}&page=1&pageSize=100`
      )
      const destination = host.querySelector<HTMLSelectElement>('[data-testid="measurement-destination-id"]')!
      expect(destination.tagName).toBe('SELECT')
      expect(destination.textContent).toContain('XeroFlow website lead')
      expect(destination.textContent).toContain('Offline click')
      expect(destination.textContent).toContain('Legacy browser lead')

      select(destination, '9002')
      check(host.querySelector<HTMLInputElement>('[data-testid="capability-google_data_manager"]')!)
      check(host.querySelector<HTMLInputElement>('[data-testid="mapping-web_conversion"]')!)
      await nextTick()
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-event-web_conversion"]')!, 'Legacy browser lead')
      input(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-destination-reason"]')!, 'Use Data Manager as an additional source for the consent-gated Google Ads website conversion')
      await nextTick()

      const save = host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-destination"]')!
      expect(save.disabled).toBe(false)
      save.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(`/api/agency/measurement/clients/${CLIENT_ID}/destinations`, {
        method: 'POST',
        body: expect.objectContaining({
          destination: expect.objectContaining({
            platform: 'google_data_manager',
            socialConnectionId: googleConnectionId,
            externalDestinationId: '9002',
            capabilities: [expect.objectContaining({
              mode: 'google_data_manager',
              managementOrigin: 'zero'
            })],
            mappings: [expect.objectContaining({ canonicalEventName: 'web_conversion' })]
          })
        })
      })
      expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('resourceName')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('ignores a stale Google action response after the operator switches platforms', async () => {
    const googleConnectionId = '44444444-4444-4444-8444-444444444444'
    let resolveActions!: (value: unknown) => void
    const pendingActions = new Promise<unknown>((resolve) => {
      resolveActions = resolve
    })
    const fetchMock = vi.fn(async (request: string) => {
      if (request === '/api/agency/social/meta/accounts') return []
      if (request === '/api/agency/social/google/accounts') {
        return [{
          id: googleConnectionId,
          accountId: '3584435581',
          accountName: 'Courtney & Patterson Ford',
          status: 'active'
        }]
      }
      if (request.includes('/google-conversion-actions?')) return pendingActions
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
    await flushUi()

    try {
      select(host.querySelector<HTMLSelectElement>('select')!, 'google_data_manager')
      await flushUi()
      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-connection"]')!, googleConnectionId)
      await flushUi()
      select(host.querySelector<HTMLSelectElement>('select')!, 'meta')
      await flushUi()
      select(host.querySelector<HTMLSelectElement>('select')!, 'google_data_manager')
      await flushUi()

      resolveActions({
        items: [{
          id: '9001',
          name: 'Stale Google lead',
          status: 'ENABLED',
          type: 'UPLOAD_CLICKS',
          category: 'SUBMIT_LEAD_FORM',
          isPrimary: false,
          includesInConversions: true,
          deliveryMode: 'offline_click'
        }],
        pagination: { hasNextPage: false }
      })
      await flushUi()

      expect(host.textContent).not.toContain('Stale Google lead')
      expect(host.textContent).toContain('Google Data Manager')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('sources GA4 credentials from the ga4 properties endpoint and saves a free-text Measurement ID destination', async () => {
    const ga4ConnectionId = '77777777-7777-4777-8777-777777777777'
    const fetchMock = vi.fn(async (request: string, options?: { method?: string, body?: unknown }) => {
      if (request === '/api/agency/social/meta/accounts') return []
      if (request === '/api/agency/social/ga4/properties') {
        return {
          connections: [{
            connectionId: ga4ConnectionId,
            accountName: 'Ferntree GA4',
            properties: [{ accountName: 'Ferntree GA4', propertyId: '123456789', propertyDisplayName: 'Ferntree Gully site' }],
            lastRunAt: null,
            lastSuccessAt: null,
            lastError: null
          }],
          maps: []
        }
      }
      if (request.endsWith('/destinations') && options?.method === 'POST') {
        return {
          destination: { id: '88888888-8888-4888-8888-888888888888' },
          profileConfigVersion: 6,
          warnings: []
        }
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
    await flushUi()

    try {
      select(host.querySelector<HTMLSelectElement>('select')!, 'ga4')
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/social/ga4/properties')
      expect(fetchMock).not.toHaveBeenCalledWith('/api/agency/social/google/accounts')
      expect(host.textContent).toContain('Measurement ID')
      expect(host.textContent).not.toContain('Dataset ID')
      expect(host.textContent).not.toContain('Conversion Action ID')
      expect(host.textContent).toContain('Ferntree GA4')

      const destination = host.querySelector<HTMLInputElement>('[data-testid="measurement-destination-id"]')!
      expect(destination.tagName).toBe('INPUT')

      select(host.querySelector<HTMLSelectElement>('[data-testid="measurement-connection"]')!, ga4ConnectionId)
      input(destination, 'G-ABC1234XYZ')
      input(host.querySelector<HTMLInputElement>('[data-testid="measurement-credential-ref"]')!, 'MEASUREMENT_PROVIDER_GA4_FERNTREE')
      check(host.querySelector<HTMLInputElement>('[data-testid="capability-ga4_measurement_protocol"]')!)
      check(host.querySelector<HTMLInputElement>('[data-testid="mapping-web_conversion"]')!)
      await nextTick()
      input(host.querySelector<HTMLInputElement>('[data-testid="provider-event-web_conversion"]')!, 'purchase')
      input(host.querySelector<HTMLTextAreaElement>('[data-testid="measurement-destination-reason"]')!, 'Map the approved GA4 Measurement Protocol destination for test validation')
      await nextTick()

      const save = host.querySelector<HTMLButtonElement>('[data-testid="save-measurement-destination"]')!
      expect(save.disabled).toBe(false)
      save.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(`/api/agency/measurement/clients/${CLIENT_ID}/destinations`, {
        method: 'POST',
        body: {
          expectedProfileVersion: 4,
          reason: 'Map the approved GA4 Measurement Protocol destination for test validation',
          destination: {
            platform: 'ga4',
            socialConnectionId: ga4ConnectionId,
            externalDestinationId: 'G-ABC1234XYZ',
            credentialRef: 'MEASUREMENT_PROVIDER_GA4_FERNTREE',
            capabilities: [{
              mode: 'ga4_measurement_protocol',
              status: 'configured',
              managementOrigin: 'zero',
              canZeroMutate: true,
              blockingReason: null
            }],
            mappings: [{
              canonicalEventName: 'web_conversion',
              enquiryType: null,
              providerEventName: 'purchase',
              isActive: true
            }]
          }
        }
      })
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('surfaces an error when GA4 connections cannot be loaded, without falling back to the Google accounts endpoint', async () => {
    const fetchMock = vi.fn(async (request: string) => {
      if (request === '/api/agency/social/meta/accounts') return []
      if (request === '/api/agency/social/ga4/properties') {
        throw new Error('GA4 connections could not be loaded')
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
    await flushUi()

    try {
      select(host.querySelector<HTMLSelectElement>('select')!, 'ga4')
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/social/ga4/properties')
      expect(fetchMock).not.toHaveBeenCalledWith('/api/agency/social/google/accounts')
      expect(host.textContent).toContain('GA4 connections could not be loaded')
      expect(host.textContent).not.toContain('No connected account is available for this provider.')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
