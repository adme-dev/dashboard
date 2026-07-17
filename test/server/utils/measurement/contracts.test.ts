import { describe, expect, it } from 'vitest'
import {
  CanonicalConversionEventSchema,
  ClientMeasurementProfileCreateSchema,
  ConversionDestinationCreateSchema,
  ConversionDestinationReadModelSchema,
  CreateConversionDestinationConfigurationSchema,
  UpdateConversionDestinationConfigurationSchema
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'

describe('ClientMeasurementProfileCreateSchema', () => {
  it('defaults new profiles to a disabled test configuration owned by Zero', () => {
    const result = ClientMeasurementProfileCreateSchema.parse({
      clientId: CLIENT_ID,
      vertical: 'automotive'
    })

    expect(result).toMatchObject({
      clientId: CLIENT_ID,
      enabled: false,
      environment: 'test',
      collectionTier: 'backend_only',
      consentMode: 'consent_gated',
      outcomeAuthority: 'zero_native',
      nativeLifecycleMode: 'crm_preferred',
      portalOutcomeMode: 'disabled'
    })
  })

  it('rejects secret-bearing or unknown profile fields', () => {
    const result = ClientMeasurementProfileCreateSchema.safeParse({
      clientId: CLIENT_ID,
      vertical: 'automotive',
      accessToken: 'must-not-enter-canonical-config'
    })

    expect(result.success).toBe(false)
  })
})

describe('ConversionDestinationCreateSchema', () => {
  it('keeps Meta web CAPI and CRM CAPI as independently evidenced capabilities', () => {
    const result = ConversionDestinationCreateSchema.parse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      capabilities: [
        {
          mode: 'meta_web_capi',
          status: 'ready',
          managementOrigin: 'external',
          canZeroMutate: false,
          evidenceAt: '2026-07-17T03:00:00.000Z'
        },
        {
          mode: 'meta_crm_capi',
          status: 'not_configured',
          managementOrigin: 'zero',
          canZeroMutate: true
        }
      ]
    })

    expect(result.enabled).toBe(false)
    expect(result.environment).toBe('test')
    expect(result.capabilities).toHaveLength(2)
    expect(result.capabilities[0]?.status).toBe('ready')
    expect(result.capabilities[1]?.status).toBe('not_configured')
  })

  it('rejects duplicate capability modes', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      capabilities: [
        { mode: 'meta_web_capi', managementOrigin: 'external', canZeroMutate: false },
        { mode: 'meta_web_capi', managementOrigin: 'external', canZeroMutate: false }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('requires timestamped evidence before a capability is ready', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      capabilities: [
        { mode: 'meta_web_capi', status: 'ready', managementOrigin: 'external', canZeroMutate: false }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('rejects capabilities that do not belong to the destination platform', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'google_data_manager',
      externalDestinationId: 'customers/4221552633',
      capabilities: [
        { mode: 'meta_crm_capi', managementOrigin: 'zero', canZeroMutate: true }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('prevents Zero mutation authority for externally managed capabilities', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      capabilities: [
        { mode: 'meta_web_capi', managementOrigin: 'external', canZeroMutate: true }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('rejects raw access tokens instead of persisting them in destination config', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      accessToken: 'must-use-an-opaque-secret-reference',
      capabilities: [
        { mode: 'meta_crm_capi', managementOrigin: 'zero', canZeroMutate: true }
      ]
    })

    expect(result.success).toBe(false)
  })
})

describe('CreateConversionDestinationConfigurationSchema', () => {
  it('defines a dormant operator configuration with explicit capability ownership and Qualified mapping', () => {
    const result = CreateConversionDestinationConfigurationSchema.parse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 1,
      reason: 'Configure Meta CRM outcome delivery in test mode',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      destination: {
        platform: 'meta',
        socialConnectionId: '44444444-4444-4444-8444-444444444444',
        externalDestinationId: '573284833843027',
        credentialRef: 'cloudflare/measurement/meta/ferntree',
        capabilities: [
          {
            mode: 'meta_crm_capi',
            status: 'configured',
            managementOrigin: 'zero',
            canZeroMutate: true
          },
          {
            mode: 'meta_web_capi',
            status: 'not_configured',
            managementOrigin: 'gtm',
            canZeroMutate: false
          }
        ],
        mappings: [
          {
            canonicalEventName: 'lead_qualified',
            providerEventName: 'QualifiedLead',
            isActive: true
          }
        ]
      }
    })

    expect(result.destination.capabilities).toHaveLength(2)
    expect(result.destination.mappings).toEqual([expect.objectContaining({
      canonicalEventName: 'lead_qualified',
      isActive: true
    })])
  })

  it('rejects manual claims of provider-validated health and live activation', () => {
    const result = CreateConversionDestinationConfigurationSchema.safeParse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 1,
      reason: 'Unsafe readiness claim',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      destination: {
        platform: 'meta',
        externalDestinationId: '573284833843027',
        enabled: true,
        environment: 'live',
        capabilities: [
          {
            mode: 'meta_crm_capi',
            status: 'ready',
            managementOrigin: 'zero',
            canZeroMutate: true,
            evidenceAt: '2026-07-17T03:00:00.000Z'
          }
        ]
      }
    })

    expect(result.success).toBe(false)
  })

  it('rejects duplicate canonical mappings and raw provider credentials', () => {
    const result = CreateConversionDestinationConfigurationSchema.safeParse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 1,
      reason: 'Invalid destination setup',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      destination: {
        platform: 'google_data_manager',
        externalDestinationId: 'customers/4221552633/conversionActions/99',
        accessToken: 'must-not-enter-canonical-config',
        capabilities: [
          {
            mode: 'google_data_manager',
            status: 'configured',
            managementOrigin: 'zero',
            canZeroMutate: true
          }
        ],
        mappings: [
          { canonicalEventName: 'lead_qualified', providerEventName: 'Qualified', isActive: true },
          { canonicalEventName: 'lead_qualified', providerEventName: 'Qualified Again', isActive: false }
        ]
      }
    })

    expect(result.success).toBe(false)
  })

  it('requires a credential source before a Zero-managed capability is configured', () => {
    const result = CreateConversionDestinationConfigurationSchema.safeParse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 1,
      reason: 'Missing credential source',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      destination: {
        platform: 'meta',
        externalDestinationId: '573284833843027',
        capabilities: [{
          mode: 'meta_crm_capi',
          status: 'configured',
          managementOrigin: 'zero',
          canZeroMutate: true
        }]
      }
    })

    expect(result.success).toBe(false)
  })
})

describe('ConversionDestinationReadModelSchema', () => {
  it('exposes credential presence without exposing the opaque reference', () => {
    const base = {
      id: '55555555-5555-4555-8555-555555555555',
      clientId: CLIENT_ID,
      profileId: PROFILE_ID,
      platform: 'meta',
      socialConnectionId: null,
      externalDestinationId: '573284833843027',
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
      capabilities: [],
      mappings: [],
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z'
    }

    expect(ConversionDestinationReadModelSchema.parse(base).credentialConfigured).toBe(true)
    expect(ConversionDestinationReadModelSchema.safeParse({
      ...base,
      credentialRef: 'cloudflare/measurement/meta/ferntree'
    }).success).toBe(false)
  })
})

describe('UpdateConversionDestinationConfigurationSchema', () => {
  const update = {
    clientId: CLIENT_ID,
    destinationId: '55555555-5555-4555-8555-555555555555',
    expectedProfileVersion: 2,
    reason: 'Add the Qualified mapping before provider validation',
    actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
    patch: {
      externalDestinationId: '573284833843027',
      credentialRef: 'cloudflare/measurement/meta/ferntree-v2',
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
  } as const

  it('accepts a versioned operator patch with complete capability and mapping replacements', () => {
    const result = UpdateConversionDestinationConfigurationSchema.parse(update)

    expect(result.expectedProfileVersion).toBe(2)
    expect(result.patch.mappings).toEqual([expect.objectContaining({
      canonicalEventName: 'lead_qualified'
    })])
  })

  it('rejects operator-owned activation and provider evidence fields', () => {
    expect(UpdateConversionDestinationConfigurationSchema.safeParse({
      ...update,
      patch: {
        ...update.patch,
        enabled: true,
        environment: 'live',
        healthStatus: 'ready',
        lastValidatedAt: '2026-07-17T05:00:00.000Z',
        providerRequestId: 'provider-secret-diagnostic'
      }
    }).success).toBe(false)
  })

  it('rejects an empty patch and manual provider-ready capability claims', () => {
    expect(UpdateConversionDestinationConfigurationSchema.safeParse({
      ...update,
      patch: {}
    }).success).toBe(false)
    expect(UpdateConversionDestinationConfigurationSchema.safeParse({
      ...update,
      patch: {
        capabilities: [{
          mode: 'meta_crm_capi',
          status: 'ready',
          managementOrigin: 'zero',
          canZeroMutate: true,
          evidenceAt: '2026-07-17T05:00:00.000Z'
        }]
      }
    }).success).toBe(false)
  })
})

describe('CanonicalConversionEventSchema', () => {
  const qualifiedEvent = {
    eventId: '33333333-3333-4333-8333-333333333333',
    clientId: CLIENT_ID,
    eventName: 'lead_qualified',
    sourceSystem: 'zero_crm',
    sourceEntityType: 'crm_opportunity',
    sourceEntityId: '44444444-4444-4444-8444-444444444444',
    sourceEventId: 'stage-history:55555555-5555-4555-8555-555555555555',
    occurredAt: '2026-07-17T03:30:00.000Z',
    idempotencyKey: 'client:lead:stage-history:lead_qualified',
    configVersion: 1,
    consentMode: 'consent_gated',
    attribution: {
      browserEventId: null,
      metaLeadId: '123456789012345',
      gclid: null,
      gbraid: null,
      wbraid: null
    }
  } as const

  it('accepts a tenant-scoped native CRM outcome without raw PII', () => {
    const result = CanonicalConversionEventSchema.parse(qualifiedEvent)

    expect(result.eventName).toBe('lead_qualified')
    expect(result.sourceSystem).toBe('zero_crm')
    expect(result.configVersion).toBe(1)
  })

  it('rejects invalid Meta lead identifiers', () => {
    const result = CanonicalConversionEventSchema.safeParse({
      ...qualifiedEvent,
      attribution: { ...qualifiedEvent.attribution, metaLeadId: 'not-a-lead-id' }
    })

    expect(result.success).toBe(false)
  })

  it('rejects raw contact data in the attribution snapshot', () => {
    const result = CanonicalConversionEventSchema.safeParse({
      ...qualifiedEvent,
      attribution: { ...qualifiedEvent.attribution, email: 'customer@example.com' }
    })

    expect(result.success).toBe(false)
  })

  it('requires a positive configuration version for deterministic replay', () => {
    const result = CanonicalConversionEventSchema.safeParse({
      ...qualifiedEvent,
      configVersion: 0
    })

    expect(result.success).toBe(false)
  })

  it('normalizes missing attribution identifiers to null', () => {
    const { attribution: _attribution, ...eventWithoutAttribution } = qualifiedEvent
    const result = CanonicalConversionEventSchema.parse(eventWithoutAttribution)

    expect(result.attribution).toEqual({
      browserEventId: null,
      metaLeadId: null,
      gclid: null,
      gbraid: null,
      wbraid: null
    })
  })
})
