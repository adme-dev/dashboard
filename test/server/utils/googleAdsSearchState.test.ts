import { describe, expect, it, vi } from 'vitest'
import type { BuildGoogleAdsActionContext } from '~~/server/utils/googleAds/actionPlanner'
import {
  loadSearchGoogleAdsPlanState,
  loadSearchGoogleAdsCurrentState,
  verifySearchGoogleAdsState
} from '~~/server/utils/googleAds/searchState'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'

const auth = { accessToken: 'access', developerToken: 'developer', loginCustomerId: '9999999999' }

function context(operation: BuildGoogleAdsActionContext['input']['operation'], args: unknown): Omit<BuildGoogleAdsActionContext, 'currentState'> {
  return {
    input: {
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      operation,
      resourceType: operation === 'add_negative_keywords' ? 'negative_keyword' : 'campaign',
      requestedMode: 'proposal',
      arguments: args,
      idempotencyKey: 'search-state-1'
    },
    connection: {
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      customerId: '1234567890',
      platform: 'google',
      status: 'active'
    },
    customerId: '1234567890'
  }
}

describe('Search Google Ads current-state loader', () => {
  it('loads one campaign status through a bounded server-authored query', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: { resourceName: 'customers/1234567890/campaigns/10', status: 'ENABLED' } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(
      context('pause_campaign', { resourceName: 'customers/1234567890/campaigns/10' }),
      auth,
      { query }
    )).resolves.toEqual({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    })

    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      customerId: '1234567890',
      auth,
      maxRows: 1,
      query: expect.stringContaining('campaign.id = 10')
    }))
    expect(query.mock.calls[0]?.[0].query).not.toContain('customers/1234567890/campaigns/10')
  })

  it('loads and normalizes existing campaign negatives with a hard row cap', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { campaignCriterion: { negative: true, keyword: { text: 'jobs', matchType: 'PHRASE' } } },
        { campaignCriterion: { negative: true, keyword: { text: 'Free', matchType: 'EXACT' } } }
      ],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('add_negative_keywords', {
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/10',
      keywords: [{ text: 'cheap', matchType: 'BROAD' }]
    }), auth, { query })).resolves.toEqual({
      criteria: [
        { text: 'Free', matchType: 'EXACT', negative: true },
        { text: 'jobs', matchType: 'PHRASE', negative: true }
      ]
    })

    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 10_000,
      query: expect.stringContaining('campaign_criterion.campaign = \'customers/1234567890/campaigns/10\'')
    }))
  })

  it('fails closed when a status resource cannot be found', async () => {
    await expect(loadSearchGoogleAdsCurrentState(
      context('pause_campaign', { resourceName: 'customers/1234567890/campaigns/10' }),
      auth,
      { query: vi.fn().mockResolvedValue({ rows: [], more: 0 }) }
    )).rejects.toThrow('was not found')
  })

  it('checks budget names before planning creation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('create_budget', {
      name: 'Northern Search Budget',
      dailyAmount: 40
    }), auth, { query })).resolves.toEqual({ exists: false })
    expect(query.mock.calls[0]?.[0]).toMatchObject({ maxRows: 1 })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign_budget.name = \'Northern Search Budget\'')
  })

  it('refuses to plan a duplicate named budget', async () => {
    await expect(loadSearchGoogleAdsCurrentState(context('create_budget', {
      name: 'Northern Search Budget',
      dailyAmount: 40
    }), auth, {
      query: vi.fn().mockResolvedValue({
        rows: [{ campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/50' } }],
        more: 0
      })
    })).rejects.toThrow('already exists')
  })
})

describe('Search Google Ads readback verification', () => {
  it('compares normalized keyword sets without depending on provider row order', () => {
    expect(verifySearchGoogleAdsState(
      { criteria: [
        { text: 'jobs', matchType: 'PHRASE', negative: true },
        { text: 'Free', matchType: 'EXACT', negative: true }
      ] },
      { criteria: [
        { text: 'Free', matchType: 'EXACT', negative: true },
        { text: 'jobs', matchType: 'PHRASE', negative: true }
      ] }
    )).toEqual({ ok: true, diffs: [] })
  })

  it('returns field-level evidence when a status does not read back', () => {
    expect(verifySearchGoogleAdsState(
      { resourceName: 'customers/1234567890/campaigns/10', status: 'PAUSED' },
      { resourceName: 'customers/1234567890/campaigns/10', status: 'ENABLED' }
    )).toEqual({
      ok: false,
      diffs: [{ field: 'status', expected: 'PAUSED', actual: 'ENABLED' }]
    })
  })

  it('ignores provider-assigned identifiers while verifying expected create fields', () => {
    expect(verifySearchGoogleAdsState(
      { name: 'Northern Search Budget', amountMicros: '40000000' },
      {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '40000000'
      }
    )).toEqual({ ok: true, diffs: [] })
  })
})

describe('Search Google Ads persisted-plan state loading', () => {
  it('reconstructs a negative-keyword read only from immutable plan fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    const plan = {
      operation: 'add_negative_keywords',
      resourceType: 'negative_keyword',
      resourceName: 'customers/1234567890/campaigns/10',
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      requestedMode: 'proposal',
      idempotencyKey: 'negative-1',
      providerOperations: [{ service: 'campaignCriteria' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toEqual({ criteria: [] })
    expect(query.mock.calls[0]?.[0].query).toContain('FROM campaign_criterion')
  })

  it('uses the provider mutation resource name to read back a created budget', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaignBudget: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_budget',
      resourceType: 'budget',
      resourceName: null,
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'budget-1',
      desiredState: {
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      },
      providerOperations: [{ service: 'campaignBudgets' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ resourceName: 'customers/1234567890/campaignBudgets/50' }]
    })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/campaignBudgets/50',
      amountMicros: '40000000'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign_budget.id = 50')
  })
})
