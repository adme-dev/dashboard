import { describe, expect, it, vi } from 'vitest'
import {
  runGoogleAdsPausePolicy,
  runGoogleAdsSearchTermPolicy
} from '~~/server/utils/googleAds/automation'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'

const clientId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const actorId = '33333333-3333-4333-8333-333333333333'
const policyId = '44444444-4444-4444-8444-444444444444'
const authority = { actorRole: 'media_buyer', hasWriteScope: true }
const flags = { read: true, write: true, automation: true, destructive: false }

function baseDependencies(overrides: Record<string, unknown> = {}) {
  return {
    resolveSession: vi.fn().mockResolvedValue({
      connection: { customerId: '1234567890' },
      auth: { accessToken: 'access', developerToken: 'developer' }
    }),
    recentAction: vi.fn().mockResolvedValue(null),
    plan: vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      executionMode: 'automatic',
      policyDecision: { allowed: true }
    } as GoogleAdsActionPlan),
    execute: vi.fn().mockResolvedValue({ ok: true, status: 'verified' }),
    event: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('Google Ads policy-limited automation runners', () => {
  it('adds only metric-qualified, unprotected, non-conflicting search terms', async () => {
    const parentResourceName = 'customers/1234567890/campaigns/10'
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            searchTermView: {
              searchTerm: 'cheap suv', status: 'NONE',
              adGroup: 'customers/1234567890/adGroups/20'
            },
            campaign: { resourceName: parentResourceName },
            metrics: { impressions: 60, clicks: 3, costMicros: 600, conversions: 0 }
          },
          {
            searchTermView: {
              searchTerm: 'Cheap  SUV', status: 'NONE',
              adGroup: 'customers/1234567890/adGroups/21'
            },
            campaign: { resourceName: parentResourceName },
            metrics: { impressions: 50, clicks: 3, costMicros: 500, conversions: 0 }
          },
          {
            searchTermView: {
              searchTerm: 'GAC free', status: 'NONE',
              adGroup: 'customers/1234567890/adGroups/20'
            },
            campaign: { resourceName: parentResourceName },
            metrics: { impressions: 200, clicks: 20, costMicros: 5000, conversions: 0 }
          },
          {
            searchTermView: {
              searchTerm: 'service', status: 'NONE',
              adGroup: 'customers/1234567890/adGroups/20'
            },
            campaign: { resourceName: parentResourceName },
            metrics: { impressions: 200, clicks: 20, costMicros: 5000, conversions: 0 }
          }
        ],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [{ adGroupCriterion: {
          negative: false,
          status: 'ENABLED',
          keyword: { text: 'Service' }
        } }],
        more: 0
      })
    const plan = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      executionMode: 'automatic',
      policyDecision: { allowed: true }
    } as GoogleAdsActionPlan)
    const deps = baseDependencies({
      query,
      plan,
      loadPolicy: vi.fn().mockResolvedValue({
        id: policyId,
        actionClass: 'negative_keywords',
        policyVersion: 'negative-v1',
        enabled: true,
        maxDailyActions: 10,
        actionsToday: 0,
        conditions: {
          lookbackDays: 30,
          cooldownHours: 24,
          allowedScopes: ['campaign'],
          resourceNames: [parentResourceName],
          protectedTerms: ['GAC'],
          minImpressions: 100,
          minClicks: 5,
          minSpendMicros: 1000,
          maxConversions: 0,
          negativeMatchType: 'EXACT',
          allowedMatchTypes: ['EXACT'],
          maxKeywordsPerAction: 5,
          maxAdditionsPerRun: 5
        }
      })
    })

    await expect(runGoogleAdsSearchTermPolicy({
      clientId, connectionId, actorId, scope: 'campaign', parentResourceName
    }, authority, flags, deps, new Date('2026-08-31T02:00:00.000Z'))).resolves.toMatchObject({
      executed: true,
      candidates: ['cheap suv'],
      evaluated: 4
    })
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      source: 'automation',
      requestedMode: 'automatic',
      operation: 'add_negative_keywords',
      arguments: {
        scope: 'campaign',
        parentResourceName,
        keywords: [{ text: 'cheap suv', matchType: 'EXACT' }]
      }
    }), authority, flags)
    expect(deps.event).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'automation_evaluated',
      metadata: expect.objectContaining({
        candidates: [expect.objectContaining({
          text: 'cheap suv',
          metrics: expect.objectContaining({ costMicros: 1100 })
        })]
      })
    }))
    expect(query.mock.calls[0]?.[0].query).toContain('segments.date BETWEEN \'2026-08-02\' AND \'2026-08-31\'')
  })

  it('blocks a search-term run during a manual-override window without querying Google', async () => {
    const parentResourceName = 'customers/1234567890/campaigns/10'
    const query = vi.fn()
    const deps = baseDependencies({
      query,
      recentAction: vi.fn().mockResolvedValue('manual_override'),
      loadPolicy: vi.fn().mockResolvedValue({
        id: policyId,
        actionClass: 'negative_keywords',
        policyVersion: 'negative-v1',
        enabled: true,
        maxDailyActions: 10,
        actionsToday: 0,
        conditions: {
          lookbackDays: 30, cooldownHours: 24,
          allowedScopes: ['campaign'], resourceNames: [parentResourceName],
          protectedTerms: [], minImpressions: 100, minClicks: 5,
          minSpendMicros: 1000, maxConversions: 0,
          negativeMatchType: 'EXACT', allowedMatchTypes: ['EXACT'],
          maxKeywordsPerAction: 5, maxAdditionsPerRun: 5
        }
      })
    })

    await expect(runGoogleAdsSearchTermPolicy({
      clientId, connectionId, actorId, scope: 'campaign', parentResourceName
    }, authority, flags, deps)).resolves.toMatchObject({
      executed: false,
      reason: 'manual_override'
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('stops at the daily cap before reading performance data', async () => {
    const resourceName = 'customers/1234567890/campaigns/10'
    const query = vi.fn()
    const deps = baseDependencies({
      query,
      loadPolicy: vi.fn().mockResolvedValue({
        id: policyId,
        actionClass: 'pause',
        policyVersion: 'pause-v1',
        enabled: true,
        conditions: {},
        maxDailyActions: 5,
        actionsToday: 5
      })
    })

    await expect(runGoogleAdsPausePolicy({
      clientId, connectionId, actorId, entityType: 'campaign', resourceName
    }, authority, flags, deps)).resolves.toMatchObject({
      executed: false,
      reason: 'daily_cap'
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('pauses an enabled allowlisted entity only after fresh metrics cross every threshold', async () => {
    const resourceName = 'customers/1234567890/campaigns/10'
    const plan = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      executionMode: 'automatic',
      policyDecision: { allowed: true }
    } as GoogleAdsActionPlan)
    const deps = baseDependencies({
      plan,
      query: vi.fn().mockResolvedValue({
        rows: [{
          campaign: { resourceName, status: 'ENABLED' },
          metrics: { impressions: 1000, clicks: 50, costMicros: 25000000, conversions: 0 }
        }],
        more: 0
      }),
      loadPolicy: vi.fn().mockResolvedValue({
        id: policyId,
        actionClass: 'pause',
        policyVersion: 'pause-v1',
        enabled: true,
        maxDailyActions: 5,
        actionsToday: 0,
        conditions: {
          lookbackDays: 14,
          cooldownHours: 48,
          allowedResourceTypes: ['campaign'],
          resourceNames: [resourceName],
          minImpressions: 500,
          minClicks: 25,
          minSpendMicros: 10000000,
          maxConversions: 0
        }
      })
    })

    await expect(runGoogleAdsPausePolicy({
      clientId, connectionId, actorId, entityType: 'campaign', resourceName
    }, authority, flags, deps, new Date('2026-08-31T02:00:00.000Z'))).resolves.toMatchObject({
      executed: true,
      metrics: { impressions: 1000, conversions: 0 }
    })
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      source: 'automation',
      requestedMode: 'automatic',
      operation: 'pause_campaign',
      arguments: { resourceName }
    }), authority, flags)
  })
})
