// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ClientMeasurementPanel from '~~/app/components/clients/ClientMeasurementPanel.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const stubs = {
  UBadge: {
    props: ['color', 'variant'],
    template: '<span data-badge><slot /></span>'
  },
  UButton: {
    props: ['disabled', 'loading', 'icon', 'label'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  },
  ClientsClientMeasurementProfileForm: {
    template: '<div data-testid="measurement-profile-form" />'
  },
  ClientsClientMeasurementProviderTest: {
    props: ['destination'],
    emits: ['close', 'completed'],
    template: '<div data-testid="provider-test">{{ destination.platform }} verification form</div>'
  },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea />'
  },
  UCheckbox: {
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<label>{{ label }}</label>'
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function responseFor(request: string) {
  if (request.endsWith(`/clients/${CLIENT_ID}`)) {
    return {
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        clientId: CLIENT_ID,
        enabled: false,
        environment: 'test',
        collectionTier: 'backend_only',
        trackingSiteId: null,
        firstPartyHostname: null,
        hostnameStatus: 'not_required',
        consentMode: 'consent_gated',
        vertical: 'automotive',
        outcomeAuthority: 'zero_native',
        nativeLifecycleMode: 'crm_preferred',
        portalOutcomeMode: 'disabled',
        configVersion: 4,
        cacheStatus: 'fresh',
        cacheVersion: 4,
        cacheErrorClass: null,
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T01:00:00.000Z'
      }
    }
  }

  if (request.endsWith('/readiness')) {
    return {
      clientId: CLIENT_ID,
      profileId: '22222222-2222-4222-8222-222222222222',
      configVersion: 4,
      status: 'onboarding',
      liveEligible: false,
      approvals: { privacy: false, live: false },
      profile: {
        enabled: false,
        environment: 'test',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      counts: {
        destinations: 2,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 3,
        readyCapabilities: 1,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      },
      blockers: [
        { code: 'destination_not_ready', message: 'One or more conversion destinations lack current ready evidence' },
        { code: 'live_approval_missing', message: 'Live approval has not been recorded' }
      ],
      lastValidatedAt: '2026-07-17T01:00:00.000Z',
      lastSuccessAt: '2026-07-17T00:45:00.000Z'
    }
  }

  if (request.endsWith('/destinations')) {
    return {
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          platform: 'meta',
          socialConnectionId: '77777777-7777-4777-8777-777777777777',
          externalDestinationId: '573284833843027',
          credentialConfigured: false,
          enabled: false,
          environment: 'test',
          healthStatus: 'ready',
          configVersion: 3,
          lastValidatedAt: '2026-07-17T01:00:00.000Z',
          lastSuccessAt: '2026-07-17T00:45:00.000Z',
          lastFailureAt: null,
          providerRequestId: 'meta-request-safe',
          errorClass: null,
          redactedError: null,
          capabilities: [
            {
              id: 'capability-1',
              mode: 'meta_pixel',
              status: 'detected',
              managementOrigin: 'gtm',
              canZeroMutate: false,
              evidenceAt: '2026-07-17T01:00:00.000Z',
              blockingReason: null
            },
            {
              id: 'capability-2',
              mode: 'meta_crm_capi',
              status: 'ready',
              managementOrigin: 'zero',
              canZeroMutate: true,
              evidenceAt: '2026-07-17T01:00:00.000Z',
              blockingReason: null
            }
          ],
          mappings: [
            {
              id: 'mapping-1',
              canonicalEventName: 'lead_qualified',
              providerEventName: 'QualifiedLead',
              isActive: true
            }
          ]
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          platform: 'google_data_manager',
          socialConnectionId: null,
          externalDestinationId: 'customers/123/conversionActions/456',
          credentialConfigured: true,
          enabled: false,
          environment: 'test',
          healthStatus: 'configured',
          configVersion: 2,
          lastValidatedAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          providerRequestId: null,
          errorClass: null,
          redactedError: null,
          capabilities: [
            {
              id: 'capability-3',
              mode: 'google_data_manager',
              status: 'configured',
              managementOrigin: 'external',
              canZeroMutate: false,
              evidenceAt: null,
              blockingReason: null
            }
          ],
          mappings: []
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          platform: 'tiktok',
          socialConnectionId: null,
          externalDestinationId: 'C1234567890',
          credentialConfigured: true,
          enabled: false,
          environment: 'test',
          healthStatus: 'configured',
          configVersion: 1,
          lastValidatedAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          providerRequestId: null,
          errorClass: null,
          redactedError: null,
          capabilities: [
            {
              id: 'capability-4',
              mode: 'tiktok_events_api',
              status: 'configured',
              managementOrigin: 'zero',
              canZeroMutate: true,
              evidenceAt: null,
              blockingReason: null
            }
          ],
          mappings: [
            {
              id: 'mapping-2',
              canonicalEventName: 'vehicle_view',
              providerEventName: 'ViewContent',
              isActive: true
            }
          ]
        }
      ],
      pagination: { page: 1, pageSize: 100, totalItems: 3, totalPages: 1 }
    }
  }

  if (request.endsWith('/audit')) {
    return {
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          entityType: 'destination',
          action: 'updated',
          configVersion: 4,
          changedFields: ['capabilities'],
          actorType: 'team_member',
          actorId: 'staff-1',
          reason: 'Document externally managed Google delivery',
          requestId: 'request-1',
          createdAt: '2026-07-17T01:00:00.000Z'
        }
      ],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }
    }
  }

  throw new Error(`Unexpected request: ${request}`)
}

describe('ClientMeasurementPanel', () => {
  it('renders canonical dormant configuration and delivery evidence without exposing credentials', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ClientMeasurementPanel, { clientId: CLIENT_ID })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
        `/api/agency/measurement/clients/${CLIENT_ID}`,
        `/api/agency/measurement/clients/${CLIENT_ID}/readiness`,
        `/api/agency/measurement/clients/${CLIENT_ID}/destinations`,
        `/api/agency/measurement/clients/${CLIENT_ID}/audit`
      ])

      expect(host.textContent).toContain('Zero is the canonical configuration and delivery-health source')
      expect(host.textContent).toContain('Dormant')
      expect(host.textContent).toContain('Backend only')
      expect(host.textContent).toContain('Zero CRM')
      expect(host.textContent).toContain('Consent gated')
      expect(host.textContent).toContain('Not eligible for live delivery')
      expect(host.textContent).toContain('Live approval has not been recorded')
      expect(host.textContent).toContain('Privacy approval pending')
      expect(host.textContent).toContain('Live approval pending')
      expect(host.textContent).toContain('Meta')
      expect(host.textContent).toContain('Google Data Manager')
      expect(host.textContent).toContain('TikTok')
      expect(host.textContent).toContain('Meta Pixel')
      expect(host.textContent).toContain('Managed in Google Tag Manager')
      expect(host.textContent).toContain('Meta CRM CAPI')
      expect(host.textContent).toContain('Managed by Zero')
      expect(host.textContent).toContain('Externally managed')
      expect(host.textContent).toContain('lead_qualified → QualifiedLead')
      expect(host.textContent).toContain('TikTok Events API')
      expect(host.textContent).toContain('vehicle_view → ViewContent')
      expect(host.textContent).toContain('Server-only lifecycle event')
      expect(host.textContent).toContain('Document externally managed Google delivery')
      expect(host.textContent).toContain('Connected account linked')
      expect(host.textContent).toContain('Credential reference configured')
      expect(host.querySelector('[data-testid="measurement-profile-form"]')).not.toBeNull()
      expect(host.textContent).not.toContain('cloudflare/measurement')
      expect(host.textContent).not.toContain('access token')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('keeps canonical profile and destination data visible when audit history is unavailable', async () => {
    const fetchMock = vi.fn(async (request: string) => {
      if (request.endsWith('/audit')) throw new Error('Audit service unavailable')
      return responseFor(request)
    })
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementPanel, { clientId: CLIENT_ID })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      expect(host.textContent).toContain('Backend only')
      expect(host.textContent).toContain('Meta CRM CAPI')
      expect(host.textContent).toContain('Audit history unavailable')
      expect(host.textContent).not.toContain('Measurement data unavailable')
    } finally {
      app.unmount()
    }
  })

  it('keeps mutation warnings visible after refreshing canonical data', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementPanel, { clientId: CLIENT_ID, canConfigure: true })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.component('ClientsClientMeasurementProfileForm', {
      emits: ['saved'],
      template: `<button data-testid="emit-profile-warning" @click="$emit('saved', {
        profile: {},
        warnings: [{ code: 'MEASUREMENT_CACHE_STALE' }]
      })">Emit warning</button>`
    })
    app.mount(host)
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="emit-profile-warning"]')!.click()
      await flushUi()
      expect(host.textContent).toContain('Saved in Zero; edge publication needs attention')
    } finally {
      app.unmount()
    }
  })

  it('exposes controlled destination verification without implying live activation', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    Object.assign(globalThis, { $fetch: fetchMock })

    const host = document.createElement('div')
    const app = createApp({
      render: () => h(ClientMeasurementPanel, { clientId: CLIENT_ID, canConfigure: true })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      const button = host.querySelector<HTMLButtonElement>('[data-testid="verify-destination-66666666-6666-4666-8666-666666666666"]')
      expect(button).not.toBeNull()
      expect(host.textContent).toContain('Controlled verification sends one provider Test Events request and never activates live delivery.')

      button!.click()
      await flushUi()

      expect(host.textContent).toContain('tiktok verification form')
      expect(host.textContent).toContain('Close verification')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
