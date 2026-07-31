import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateSearchAuthorityOpportunities,
  scoreSearchAuthorityCandidate,
  searchAuthorityFingerprint
} from '~~/server/utils/searchAuthority/opportunities'

const dbMocks = vi.hoisted(() => ({
  queryRows: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/db', () => dbMocks)

const base = {
  clientId: '11111111-1111-4111-8111-111111111111',
  propertyMapId: '22222222-2222-4222-8222-222222222222',
  queryText: 'cannon alpha towing capacity',
  pageUrl: 'https://example.com/cannon-alpha',
  current: {
    clicks: 20,
    impressions: 1000,
    ctr: 0.02,
    position: 7
  },
  previous: {
    clicks: 40,
    impressions: 1200,
    ctr: 0.0333,
    position: 6
  },
  coverageDays: 28,
  provisional: false
}

describe('Search Authority explainable opportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scores low CTR against a versioned position-band baseline with literal reasons', () => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType: 'low_ctr'
    })

    expect(result.scoringVersion).toBe('gsc-v1')
    expect(result.score).toBeGreaterThanOrEqual(50)
    expect(result.confidence).toBe(1)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ctr_below_position_baseline',
        observed: 0.02,
        expected: 0.04
      }),
      expect.objectContaining({
        code: 'material_impressions',
        observed: 1000
      })
    ]))
  })

  it.each([
    ['striking_distance', 4, 15],
    ['declining', 30, 100],
    ['growth', 100, 30]
  ] as const)('produces deterministic %s evidence', (opportunityType, currentClicks, previousClicks) => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType,
      current: { ...base.current, clicks: currentClicks },
      previous: { ...base.previous, clicks: previousClicks }
    })
    expect(result.score).toBeGreaterThan(0)
    expect(result.reasonCodes.length).toBeGreaterThan(0)
  })

  it('detects material impression decline even when clicks are flat', () => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType: 'declining',
      current: { ...base.current, clicks: 50, impressions: 500 },
      previous: { ...base.previous, clicks: 50, impressions: 1000 }
    })

    expect(result.score).toBeGreaterThan(0)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'impressions_declined',
        observed: -50
      })
    ]))
  })

  it('does not promote immaterial trend changes', () => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType: 'growth',
      current: { ...base.current, clicks: 2, impressions: 10 },
      previous: { ...base.previous, clicks: 1, impressions: 5 }
    })

    expect(result.score).toBe(0)
  })

  it('reduces confidence for provisional and incomplete windows', () => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType: 'low_ctr',
      provisional: true,
      coverageDays: 10
    })
    expect(result.confidence).toBe(0.55)
    expect(result.reasonCodes.map(reason => reason.code)).toEqual(expect.arrayContaining([
      'provider_data_provisional',
      'incomplete_evidence_window'
    ]))
  })

  it('reduces trend confidence when the comparison window is missing', () => {
    const result = scoreSearchAuthorityCandidate({
      ...base,
      opportunityType: 'growth',
      previous: null
    })

    expect(result.confidence).toBe(0.7)
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_comparison_window' })
    ]))
  })

  it('uses one stable fingerprint per normalized type/query/page identity', () => {
    expect(searchAuthorityFingerprint(
      'low_ctr',
      ' Cannon Alpha Towing Capacity ',
      'HTTPS://EXAMPLE.COM/cannon-alpha'
    )).toBe(searchAuthorityFingerprint(
      'low_ctr',
      'cannon alpha towing capacity',
      'https://example.com/cannon-alpha'
    ))
    expect(searchAuthorityFingerprint(
      'growth',
      'cannon alpha towing capacity',
      'https://example.com/cannon-alpha'
    )).not.toBe(searchAuthorityFingerprint(
      'low_ctr',
      'cannon alpha towing capacity',
      'https://example.com/cannon-alpha'
    ))
  })

  it('upserts recurring candidates and appends evidence instead of duplicating identity', async () => {
    const upsertOpportunity = vi.fn(async input => ({
      id: 'opportunity-1',
      fingerprint: input.fingerprint
    }))
    const result = await generateSearchAuthorityOpportunities(
      base.clientId,
      { startDate: '2026-07-01', endDate: '2026-07-28' },
      {
        loadCandidates: vi.fn(async () => [base]),
        upsertOpportunity
      }
    )

    expect(result.generated).toBeGreaterThan(0)
    const lowCtr = upsertOpportunity.mock.calls.find(call => (
      call[0].opportunityType === 'low_ctr'
    ))?.[0]
    expect(lowCtr).toMatchObject({
      fingerprint: searchAuthorityFingerprint(
        'low_ctr',
        base.queryText,
        base.pageUrl
      ),
      evidenceStartDate: '2026-07-01',
      evidenceEndDate: '2026-07-28'
    })
    expect(lowCtr.reasonCodes.length).toBeGreaterThan(0)
  })

  it('uses numeric CTR division when loading aggregate evidence', async () => {
    dbMocks.queryRows.mockResolvedValue([{
      property_map_id: base.propertyMapId,
      query_text: base.queryText,
      page_url: base.pageUrl,
      current_clicks: '20',
      current_impressions: '1000',
      current_ctr: '0.02',
      current_position: '7',
      previous_clicks: '40',
      previous_impressions: '1200',
      previous_ctr: '0.0333',
      previous_position: '6',
      coverage_days: '28',
      previous_coverage_days: '28',
      provisional: false
    }])

    await generateSearchAuthorityOpportunities(
      base.clientId,
      { startDate: '2026-07-01', endDate: '2026-07-28' },
      { upsertOpportunity: vi.fn(async input => ({
        id: 'opportunity-1',
        fingerprint: input.fingerprint
      })) }
    )

    expect(dbMocks.queryRows.mock.calls[0]?.[0]).toMatch(
      /SUM\(clicks\) FILTER \([\s\S]+?\)\)::numeric/
    )
    expect(dbMocks.queryRows.mock.calls[0]?.[0]).toContain(
      'FROM gsc_daily_property'
    )
  })

  it('marks trends as lower confidence when property comparison evidence is incomplete', async () => {
    const upsertOpportunity = vi.fn(async input => ({
      id: 'opportunity-1',
      fingerprint: input.fingerprint
    }))
    dbMocks.queryRows.mockResolvedValue([{
      property_map_id: base.propertyMapId,
      query_text: base.queryText,
      page_url: base.pageUrl,
      current_clicks: '100',
      current_impressions: '1000',
      current_ctr: '0.1',
      current_position: '50',
      previous_clicks: '0',
      previous_impressions: '0',
      previous_ctr: '0',
      previous_position: '0',
      coverage_days: '28',
      previous_coverage_days: '10',
      provisional: false
    }])

    await generateSearchAuthorityOpportunities(
      base.clientId,
      { startDate: '2026-07-01', endDate: '2026-07-28' },
      { upsertOpportunity }
    )

    const growth = upsertOpportunity.mock.calls.find(call => (
      call[0].opportunityType === 'growth'
    ))?.[0]
    expect(growth).toMatchObject({
      confidence: 0.7,
      previous: null
    })
    expect(growth.reasonCodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_comparison_window' })
    ]))
  })

  it('updates recurrence and appends immutable evidence in one transaction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'opportunity-1', fingerprint: 'fingerprint' }]
      })
      .mockResolvedValueOnce({ rows: [] })
    dbMocks.transaction.mockImplementation(async callback => callback({ query }))

    await generateSearchAuthorityOpportunities(
      base.clientId,
      { startDate: '2026-07-01', endDate: '2026-07-28' },
      {
        loadCandidates: vi.fn(async () => [{
          ...base,
          current: { ...base.current, clicks: 100, ctr: 0.5, position: 50 },
          previous: { ...base.previous, clicks: 10, impressions: 1000 }
        }])
      }
    )

    expect(query.mock.calls[0]?.[0]).toContain(
      'last_detected_at = NOW()'
    )
    expect(query.mock.calls[1]?.[0]).toContain(
      'INSERT INTO search_authority_opportunity_evidence'
    )
  })
})
