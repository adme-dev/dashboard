import { describe, expect, it } from 'vitest'
import {
  CreateOutcomeEndpointConfigurationSchema,
  OutcomeEndpointReadModelSchema
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

describe('Measurement outcome endpoint contracts', () => {
  it('accepts disabled external-CRM endpoint policy with an opaque secret reference', () => {
    const result = CreateOutcomeEndpointConfigurationSchema.parse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 4,
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      reason: 'Prepare the approved dealer CRM webhook in test mode',
      endpoint: {
        label: 'Dealer CRM production tenant',
        sourceSystem: 'dealer_crm',
        currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1',
        replayWindowSeconds: 300,
        rateLimitPerMinute: 60
      }
    })

    expect(result.endpoint.sourceSystem).toBe('dealer_crm')
    expect(result.endpoint.replayWindowSeconds).toBe(300)
  })

  it('rejects client-selected endpoint keys, live state, and raw secrets', () => {
    expect(CreateOutcomeEndpointConfigurationSchema.safeParse({
      clientId: CLIENT_ID,
      expectedProfileVersion: 4,
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      reason: 'Unsafe endpoint setup',
      endpoint: {
        label: 'Dealer CRM',
        sourceSystem: 'dealer_crm',
        endpointKey: 'client-selected-key-must-not-be-accepted',
        status: 'live',
        webhookSecret: 'raw-secret-must-not-enter-postgres',
        currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1'
      }
    }).success).toBe(false)
  })

  it('exposes the endpoint URL identity and secret presence without secret references', () => {
    const readModel = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: CLIENT_ID,
      profileId: '22222222-2222-4222-8222-222222222222',
      endpointKey: 'a'.repeat(43),
      label: 'Dealer CRM',
      sourceSystem: 'dealer_crm',
      secretConfigured: true,
      secretVersion: 1,
      status: 'disabled',
      replayWindowSeconds: 300,
      rateLimitPerMinute: 60,
      configVersion: 5,
      lastReceivedAt: null,
      createdAt: '2026-07-17T07:00:00.000Z',
      updatedAt: '2026-07-17T07:00:00.000Z'
    }

    expect(OutcomeEndpointReadModelSchema.parse(readModel).secretConfigured).toBe(true)
    expect(OutcomeEndpointReadModelSchema.safeParse({
      ...readModel,
      currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1'
    }).success).toBe(false)
  })
})
