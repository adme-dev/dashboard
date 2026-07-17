import { describe, expect, it } from 'vitest'
import {
  CanonicalConversionEventSchema,
  ClientMeasurementProfileCreateSchema,
  ConversionDestinationCreateSchema
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
