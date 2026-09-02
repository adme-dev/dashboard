// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ClientMeasurementPanel from '~~/app/components/clients/ClientMeasurementPanel.client.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const toastAdd = vi.fn()

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
    props: ['destinationConfigVersion'],
    template: '<div data-testid="measurement-provider-test" :data-destination-version="destinationConfigVersion" />'
  },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UInput: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UCheckbox: {
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: `<label><input
      type="checkbox"
      :checked="modelValue"
      @change="$emit('update:modelValue', $event.target.checked)"
    >{{ label }}</label>`
  },
  UModal: {
    props: ['open', 'title', 'description', 'ui'],
    emits: ['update:open'],
    template: `<div v-if="open" data-modal>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <slot name="body" />
      <slot name="footer" />
    </div>`
  },
  USelect: {
    props: ['modelValue', 'items', 'valueKey'],
    emits: ['update:modelValue'],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
    </select>`
  },
  UFormField: {
    props: ['label', 'help', 'required'],
    template: '<label><span>{{ label }}</span><slot /><span v-if="help">{{ help }}</span></label>'
  },
  UAlert: {
    props: ['title', 'description', 'color', 'icon'],
    template: '<div role="status" :data-color="color">{{ title }} {{ description }}</div>'
  }
}

function mountPanel(
  fetchMock: ReturnType<typeof vi.fn>,
  props: Record<string, unknown> = {}
) {
  Object.assign(globalThis, { $fetch: fetchMock, useToast: () => ({ add: toastAdd }) })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(ClientMeasurementPanel, { clientId: CLIENT_ID, ...props })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function input(element: Element, value: string) {
  const field = element as HTMLInputElement | HTMLTextAreaElement
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

function check(element: Element) {
  const box = element.querySelector('input') ?? element as HTMLInputElement
  box.checked = true
  box.dispatchEvent(new Event('change', { bubbles: true }))
}

function select(element: Element, value: string) {
  const field = element as HTMLSelectElement
  field.value = value
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function responseFor(request: string, options: { live?: boolean } = {}) {
  if (request.endsWith(`/clients/${CLIENT_ID}`)) {
    return {
      profile: {
        id: '22222222-2222-4222-8222-222222222222',
        clientId: CLIENT_ID,
        desiredEnabled: true,
        desiredStateSource: 'existing_review',
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
        desiredEnabled: true,
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
          enabled: options.live ?? false,
          environment: options.live ? 'live' : 'test',
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
        }
      ],
      pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 }
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

  if (request.includes('/reconciliation')) {
    return {
      accountResolution: {
        status: 'resolved', resolutionKind: 'direct', clientId: CLIENT_ID,
        canonicalName: 'Northern Motor Group', matchedName: 'Northern GAC', matchKind: 'alias',
        accounts: [{
          connectionId: '77777777-7777-4777-8777-777777777777',
          operatingCustomerId: '7583977544', loginCustomerId: '6692975433',
          accountRole: 'dealer', connectionStatus: 'active', connectionAccountName: 'Northern GAC'
        }]
      },
      reconciliation: {
        clientId: CLIENT_ID,
        expectedAccountCustomerId: '7583977544',
        summary: { destination_not_configured: 1, not_observed: 7 },
        items: [{
          identity: { canonicalEventName: 'phone_click', enquiryType: null },
          state: 'destination_not_configured',
          diagnostic: 'Phone clicks captured; no Google Ads website action is mapped.',
          known: ['Captured events: 12'], inferred: [],
          blockers: ['destination_not_configured'], capturedCount: 12,
          latestEvidenceAt: '2026-09-02T03:30:00.000Z', destination: null,
          stages: { deliveryAttempted: 0, delivered: 0, failed: 0, providerAccepted: 0, providerReportingObserved: 0 }
        }]
      }
    }
  }

  if (request.endsWith('/freshness')) {
    return {
      clientId: CLIENT_ID,
      streams: [
        { stream: 'spend', status: 'fresh', metricsAvailable: true, reason: 'spend data is fresh.', lastSuccessAt: '2026-09-02T04:00:00.000Z' },
        { stream: 'campaign_conversions', status: 'syncing', metricsAvailable: false, reason: 'Conversion totals unavailable while historical resync is pending.', lastSuccessAt: '2026-09-02T03:00:00.000Z' },
        { stream: 'conversion_actions', status: 'fresh', metricsAvailable: true, reason: 'conversion actions data is fresh.', lastSuccessAt: '2026-09-02T04:00:00.000Z' },
        { stream: 'website_events', status: 'fresh', metricsAvailable: true, reason: 'website events data is fresh.', lastSuccessAt: '2026-09-02T03:30:00.000Z' },
        { stream: 'provider_calls', status: 'fresh', metricsAvailable: true, reason: 'provider calls data is fresh.', lastSuccessAt: '2026-09-02T04:00:00.000Z' }
      ]
    }
  }

  if (request.includes('/api/agency/analytics/google-calls?')) {
    return {
      health: {
        status: 'success_empty', outcome: 'sync successful; no calls returned',
        verifiedCallTracking: false, lastSuccessAt: '2026-09-02T04:00:00.000Z'
      },
      layers: {
        websitePhoneClicks: 12, googleHostedCallInteractions: 0,
        connectedCalls: 0, qualifiedCalls: 0,
        lastWebsiteEvidenceAt: '2026-09-02T03:30:00.000Z',
        lastProviderCallSyncAt: '2026-09-02T04:00:00.000Z'
      }
    }
  }

  if (request.includes('/google-conversion-actions?') && request.includes('mode=registry')) {
    return {
      connection: { id: '77777777-7777-4777-8777-777777777777', accountId: '7583977544', accountName: 'Northern GAC' },
      items: [
        {
          id: '901', resourceName: 'customers/7583977544/conversionActions/901', name: 'Website phone click',
          status: 'ENABLED', type: 'WEBPAGE', category: 'PHONE_CALL_LEAD', origin: 'WEBSITE',
          primaryForGoal: false, deliveryClass: 'website_tag', managementOwner: 'gtm',
          primaryState: 'secondary', goalBiddability: 'not_biddable', mappingState: 'unmapped',
          providerSyncedAt: '2026-09-02T04:00:00.000Z', lastEvidenceAt: null,
          recentActivity: { window: 'LAST_30_DAYS', allConversions: 0, state: 'zero' }
        },
        {
          id: '902', resourceName: 'customers/7583977544/conversionActions/902', name: 'Clicks to call',
          status: 'ENABLED', type: 'CLICK_TO_CALL', category: 'PHONE_CALL_LEAD', origin: 'GOOGLE_HOSTED',
          primaryForGoal: true, deliveryClass: 'google_hosted_call', managementOwner: 'google',
          primaryState: 'primary', goalBiddability: 'biddable', mappingState: 'unmapped',
          providerSyncedAt: '2026-09-02T04:00:00.000Z', lastEvidenceAt: null,
          recentActivity: { window: 'LAST_30_DAYS', allConversions: 0, state: 'zero' }
        }
      ]
    }
  }

  throw new Error(`Unexpected request: ${request}`)
}

describe('ClientMeasurementPanel', () => {
  beforeEach(() => {
    toastAdd.mockClear()
  })

  it('renders canonical dormant configuration and delivery evidence without exposing credentials', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock)
    await flushUi()

    try {
      expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
        `/api/agency/measurement/clients/${CLIENT_ID}`,
        `/api/agency/measurement/clients/${CLIENT_ID}/readiness`,
        `/api/agency/measurement/clients/${CLIENT_ID}/destinations`,
        `/api/agency/measurement/clients/${CLIENT_ID}/audit`,
        `/api/agency/measurement/clients/${CLIENT_ID}/reconciliation`,
        `/api/agency/measurement/clients/${CLIENT_ID}/freshness`,
        expect.stringContaining(`/api/agency/analytics/google-calls?`),
        expect.stringContaining(`/google-conversion-actions?connectionId=77777777-7777-4777-8777-777777777777&mode=registry`)
      ])

      expect(host.textContent).toContain('Zero is the canonical configuration and delivery-health source')
      expect(host.textContent).toContain('On — setup required')
      expect(host.textContent).toContain('Existing client review')
      expect(host.textContent).toContain('Backend only')
      expect(host.textContent).toContain('Zero CRM')
      expect(host.textContent).toContain('Consent gated')
      expect(host.textContent).toContain('Not eligible for live delivery')
      expect(host.textContent).toContain('Live approval has not been recorded')
      expect(host.textContent).toContain('Privacy approval pending')
      expect(host.textContent).toContain('Live approval pending')
      expect(host.textContent).toContain('Meta')
      expect(host.textContent).toContain('Google Data Manager')
      expect(host.textContent).toContain('Meta Pixel')
      expect(host.textContent).toContain('Managed in Google Tag Manager')
      expect(host.textContent).toContain('Meta CRM CAPI')
      expect(host.textContent).toContain('Managed by Zero')
      expect(host.textContent).toContain('Externally managed')
      expect(host.textContent).toContain('lead_qualified → QualifiedLead')
      expect(host.textContent).toContain('Server-only lifecycle event')
      expect(host.textContent).toContain('Document externally managed Google delivery')
      expect(host.textContent).toContain('Connected account linked')
      expect(host.textContent).toContain('Credential reference configured')
      expect(host.textContent).toContain('Northern GAC')
      expect(host.textContent).toContain('7583977544')
      expect(host.textContent).toContain('6692975433')
      expect(host.textContent).toContain('77777777-7777-4777-8777-777777777777')
      expect(host.textContent).toContain('Direct · Alias')
      expect(host.textContent).toContain('Website phone click')
      expect(host.textContent).toContain('Website Tag')
      expect(host.textContent).toContain('Clicks to call')
      expect(host.textContent).toContain('Google Hosted Call')
      expect(host.textContent).toContain('0 conversions · LAST 30 DAYS')
      expect(host.textContent).toContain('Website phone clicks')
      expect(host.textContent).toContain('12')
      expect(host.textContent).toContain('sync successful; no calls returned')
      expect(host.textContent).toContain('Conversion totals unavailable while historical resync is pending')
      expect(host.textContent).toContain('Phone clicks captured; no Google Ads website action is mapped')
      expect(host.querySelector('[data-testid="measurement-account-search"]')).not.toBeNull()
      expect(host.querySelector('[data-testid="measurement-profile-form"]')).not.toBeNull()
      expect(host.textContent).not.toContain('cloudflare/measurement')
      expect(host.textContent).not.toContain('access token')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('records an explicit client-wide signal opt-out without activating delivery', async () => {
    const fetchMock = vi.fn(async (request: string, options?: {
      method?: string
      body?: Record<string, unknown>
    }) => {
      if (options?.method === 'PUT') {
        return {
          profile: {
            ...responseFor(`/api/agency/measurement/clients/${CLIENT_ID}`).profile,
            desiredEnabled: false,
            desiredStateSource: 'explicit_opt_out',
            configVersion: 5
          },
          warnings: []
        }
      }
      return responseFor(request)
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="measurement-desired-state-action"]')!.click()
      await flushUi()
      input(
        host.querySelector('[data-testid="measurement-desired-state-reason"]')!,
        'Client requested all signals be disabled'
      )
      check(host.querySelector('[data-testid="measurement-desired-state-confirmed"]')!)
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="measurement-desired-state-submit"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/agency/measurement/clients/${CLIENT_ID}/profile`,
        {
          method: 'PUT',
          body: {
            expectedVersion: 4,
            reason: 'Client requested all signals be disabled',
            patch: { desiredEnabled: false }
          }
        }
      )
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Measurement signals turned off'
      }))
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
    const { app, host } = mountPanel(fetchMock)
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

  it('resolves an exact dealership alias without assuming group aggregation', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock, { clientName: 'Northern GAC' })
    await flushUi()

    try {
      expect(fetchMock.mock.calls.map(call => String(call[0]))).toContain(
        `/api/agency/measurement/clients/${CLIENT_ID}/reconciliation?accountQuery=Northern%20GAC`
      )
      expect(host.querySelector<HTMLInputElement>('[data-testid="measurement-account-search"]')?.value)
        .toBe('Northern GAC')
      expect(host.textContent).toContain('Group aggregation is never assumed')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('keeps mutation warnings visible after refreshing canonical data', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    Object.assign(globalThis, { $fetch: fetchMock, useToast: () => ({ add: toastAdd }) })

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

  it('explains how each capability reaches ready and what is still outstanding', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock)
    await flushUi()

    try {
      // meta_pixel is covered by no provider test; meta_crm_capi is covered by Meta Test Events.
      expect(host.querySelector('[data-testid="capability-assurance-meta_pixel"]')!.textContent)
        .toContain('Requires operator attestation')
      expect(host.querySelector('[data-testid="capability-assurance-meta_crm_capi"]')!.textContent)
        .toContain('Verified by provider test')

      // The description comes from the shared capability definitions, not a local copy.
      expect(host.textContent).toContain('Browser events, usually managed in GTM or the client website.')

      const breakdowns = [...host.querySelectorAll('[data-testid="destination-readiness-breakdown"]')]
      expect(breakdowns).toHaveLength(2)
      expect(breakdowns[0]!.textContent).toContain('1 of 2')
      expect(breakdowns[0]!.textContent).toContain('Meta Pixel')
      expect(breakdowns[0]!.textContent).toContain('no provider test can prove this one')
      expect(breakdowns[1]!.textContent).toContain('run a provider test to record evidence for it')
    } finally {
      app.unmount()
    }
  })

  it('opens provider tests with the selected destination version', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      const runButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
        .find(button => button.textContent?.includes('Run provider test'))
      expect(runButton).toBeDefined()

      runButton!.click()
      await flushUi()

      expect(
        host.querySelector('[data-testid="measurement-provider-test"]')
          ?.getAttribute('data-destination-version')
      ).toBe('3')
    } finally {
      app.unmount()
    }
  })

  it('offers attestation only for capabilities no provider test covers', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      expect(host.querySelector('[data-testid="attest-meta_pixel"]')).not.toBeNull()
      // Covered by a provider test, so the server would refuse the attestation.
      expect(host.querySelector('[data-testid="attest-meta_crm_capi"]')).toBeNull()
      expect(host.querySelector('[data-testid="attest-google_data_manager"]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('still offers attestation for a capability already ready, so a live tag loss can be reported', async () => {
    const fetchMock = vi.fn(async (request: string) => {
      const response = responseFor(request, { live: true })
      if (request.endsWith('/destinations')) {
        const body = response as { items: Array<{ capabilities: Array<{ mode: string, status: string }> }> }
        // meta_pixel is attestation-only; ready is exactly the state an operator
        // needs to be able to downgrade when e.g. the pixel is removed from GTM.
        body.items[0]!.capabilities[0]!.status = 'ready'
      }
      return response
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      expect(host.querySelector('[data-testid="attest-meta_pixel"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('hides the attestation control from operators who cannot configure', async () => {
    const fetchMock = vi.fn(async (request: string) => responseFor(request))
    const { app, host } = mountPanel(fetchMock)
    await flushUi()

    try {
      expect(host.querySelector('[data-testid="attest-meta_pixel"]')).toBeNull()
      // The readiness explanation is still visible — it is read-only.
      expect(host.querySelector('[data-testid="destination-readiness-breakdown"]')).not.toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('posts an attestation without the fields the server injects, then refreshes', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { body?: unknown }) => {
      if (options) {
        return {
          healthStatus: 'ready',
          capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }]
        }
      }
      return responseFor(request)
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="attest-meta_pixel"]')!.click()
      await flushUi()
      expect(host.querySelector('[data-testid="measurement-attestation-modal"]')).not.toBeNull()
      // Title and description go to the dialog itself so it is labelled for screen readers.
      expect(host.querySelector('[data-modal] h2')!.textContent).toBe('Attest Meta Pixel')
      expect(host.querySelector('[data-modal] p')!.textContent)
        .toBe('Browser events, usually managed in GTM or the client website.')
      // Status defaults to ready, so no blocking-reason field is asked for.
      expect(host.querySelector('[data-testid="attestation-blocking-reason"]')).toBeNull()
      expect(host.querySelector('[data-testid="attestation-live-warning"]')).toBeNull()

      const submit = host.querySelector<HTMLButtonElement>('[data-testid="submit-attestation"]')!
      expect(submit.disabled).toBe(true)

      input(host.querySelector('[data-testid="attestation-reason"]')!, 'Confirmed the pixel in Events Manager')
      check(host.querySelector('[data-testid="attestation-confirmed"]')!)
      await flushUi()
      expect(submit.disabled).toBe(false)

      submit.click()
      await flushUi()

      const attestCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/attest'))!
      expect(attestCall[0]).toBe(
        `/api/agency/measurement/clients/${CLIENT_ID}/destinations/33333333-3333-4333-8333-333333333333/attest`
      )
      expect(attestCall[1]).toEqual({
        method: 'POST',
        body: {
          expectedConfigVersion: 3,
          capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }],
          reason: 'Confirmed the pixel in Events Manager',
          confirmed: true,
          force: false
        }
      })
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Attestation recorded',
        color: 'success'
      }))
      expect(host.querySelector('[data-testid="measurement-attestation-modal"]')).toBeNull()
      // Four initial loads plus the attestation plus four refresh loads.
      expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/destinations'))).toHaveLength(2)
    } finally {
      app.unmount()
    }
  })

  it('sends the blocking reason and holds back force until the operator asks for it', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { body?: unknown }) => {
      if (options) {
        return {
          healthStatus: 'blocked',
          capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Container was rolled back' }]
        }
      }
      return responseFor(request, { live: true })
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="attest-meta_pixel"]')!.click()
      await flushUi()

      // Degraded needs a reason but never threatens live delivery.
      select(host.querySelector('[data-testid="attestation-status"]')!, 'degraded')
      await flushUi()
      expect(host.querySelector('[data-testid="attestation-blocking-reason"]')).not.toBeNull()
      expect(host.querySelector('[data-testid="attestation-live-warning"]')).toBeNull()

      select(host.querySelector('[data-testid="attestation-status"]')!, 'blocked')
      await flushUi()
      const warning = host.querySelector('[data-testid="attestation-live-warning"]')
      expect(warning).not.toBeNull()
      expect(warning!.textContent).toContain('Blocking this stops live delivery')
      expect(warning!.textContent).toContain('Zero records it as degraded instead')
      expect(host.querySelector('[data-testid="attestation-force"]')).not.toBeNull()

      const submit = host.querySelector<HTMLButtonElement>('[data-testid="submit-attestation"]')!
      input(host.querySelector('[data-testid="attestation-reason"]')!, 'Tag removed during a site rollback')
      check(host.querySelector('[data-testid="attestation-confirmed"]')!)
      await flushUi()
      // Blocked still needs the blocking reason before it can be recorded.
      expect(submit.disabled).toBe(true)

      input(host.querySelector('[data-testid="attestation-blocking-reason"]')!, 'Container was rolled back')
      check(host.querySelector('[data-testid="attestation-force"]')!)
      await flushUi()
      expect(submit.disabled).toBe(false)

      submit.click()
      await flushUi()

      const attestCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/attest'))!
      expect(attestCall[1]).toEqual({
        method: 'POST',
        body: {
          expectedConfigVersion: 3,
          capabilities: [{
            mode: 'meta_pixel',
            status: 'blocked',
            blockingReason: 'Container was rolled back'
          }],
          reason: 'Tag removed during a site rollback',
          confirmed: true,
          force: true
        }
      })
    } finally {
      app.unmount()
    }
  })

  it('reports the downgrade when a live block is recorded without force', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { body?: unknown }) => {
      if (options) {
        return {
          healthStatus: 'degraded',
          capabilities: [{ mode: 'meta_pixel', status: 'degraded', blockingReason: 'Tag missing' }]
        }
      }
      return responseFor(request, { live: true })
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="attest-meta_pixel"]')!.click()
      await flushUi()
      select(host.querySelector('[data-testid="attestation-status"]')!, 'blocked')
      await flushUi()
      input(host.querySelector('[data-testid="attestation-blocking-reason"]')!, 'Tag missing')
      input(host.querySelector('[data-testid="attestation-reason"]')!, 'Checked the live site')
      check(host.querySelector('[data-testid="attestation-confirmed"]')!)
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="submit-attestation"]')!.click()
      await flushUi()

      const attestCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/attest'))!
      expect((attestCall[1] as { body: { force: boolean } }).body.force).toBe(false)
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Attestation recorded',
        color: 'warning',
        description: expect.stringContaining('recorded as degraded, not blocked')
      }))
    } finally {
      app.unmount()
    }
  })

  it('keeps the modal open and explains a stale configuration version', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { body?: unknown }) => {
      if (options) {
        throw Object.assign(new Error('Conflict'), {
          statusCode: 409,
          data: { statusMessage: 'Measurement configuration changed; discard stale validation evidence' }
        })
      }
      return responseFor(request)
    })
    const { app, host } = mountPanel(fetchMock, { canConfigure: true })
    await flushUi()

    try {
      host.querySelector<HTMLButtonElement>('[data-testid="attest-meta_pixel"]')!.click()
      await flushUi()
      input(host.querySelector('[data-testid="attestation-reason"]')!, 'Verified the tag')
      check(host.querySelector('[data-testid="attestation-confirmed"]')!)
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="submit-attestation"]')!.click()
      await flushUi()

      expect(host.querySelector('[data-testid="measurement-attestation-modal"]')).not.toBeNull()
      expect(host.querySelector('[data-testid="attestation-error"]')!.textContent)
        .toContain('The configuration changed while this was open')
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Attestation not recorded',
        color: 'error'
      }))
    } finally {
      app.unmount()
    }
  })
})
