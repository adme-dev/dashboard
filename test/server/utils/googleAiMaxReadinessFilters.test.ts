import { describe, expect, it } from 'vitest'
import { parseGoogleAiMaxReadinessQuery } from '~~/server/utils/googleAiMaxReadiness'

describe('parseGoogleAiMaxReadinessQuery', () => {
  it('normalizes every supported readiness filter', () => {
    expect(parseGoogleAiMaxReadinessQuery({
      page: '2',
      pageSize: '50',
      status: 'needs_review',
      connectionId: '00000000-0000-4000-8000-000000000001',
      clientId: '00000000-0000-4000-8000-000000000002',
      campaignStatus: 'PAUSED',
      migrationReason: 'aca_and_campaign_broad_match',
      stale: 'warning',
      changedSince: '2026-08-01T00:00:00.000Z',
      search: '  Generic Search  ',
    })).toEqual({
      page: 2,
      pageSize: 50,
      status: 'needs_review',
      connectionId: '00000000-0000-4000-8000-000000000001',
      clientId: '00000000-0000-4000-8000-000000000002',
      campaignStatus: 'PAUSED',
      migrationReason: 'aca_and_campaign_broad_match',
      stale: 'warning',
      changedSince: '2026-08-01T00:00:00.000Z',
      search: 'Generic Search',
    })
  })

  it('uses bounded pagination defaults', () => {
    expect(parseGoogleAiMaxReadinessQuery({})).toMatchObject({ page: 1, pageSize: 25 })
    expect(() => parseGoogleAiMaxReadinessQuery({ pageSize: '101' })).toThrow(
      'Invalid AI Max readiness query',
    )
  })

  it.each([
    { status: 'healthy' },
    { migrationReason: 'maybe' },
    { stale: 'yes' },
    { changedSince: 'yesterday' },
    { connectionId: 'not-a-uuid' },
    { search: 'x'.repeat(101) },
  ])('rejects invalid filter input %#', (query) => {
    expect(() => parseGoogleAiMaxReadinessQuery(query)).toThrow(
      'Invalid AI Max readiness query',
    )
  })
})
