import { describe, expect, it, vi } from 'vitest'
import {
  getGoogleAiMaxReadinessDetail,
  listGoogleAiMaxReadiness,
  listGoogleAiMaxReadinessForExport
} from '~~/server/utils/googleAiMaxReadiness'

describe('listGoogleAiMaxReadiness', () => {
  it('uses one filter contract for reconciled summary and paginated items', async () => {
    const queryOne = vi.fn()
      .mockResolvedValueOnce({
        eligible: '3',
        affected: '2',
        enabled: '1',
        needs_review: '1',
        unknown: '1',
        changed: '2'
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        status: 'partial',
        trigger: 'manual',
        total_connections: 2,
        processed_connections: 1,
        total_campaigns: 3,
        affected_campaigns: 2,
        unknown_campaigns: 1,
        failures: [],
        started_at: '2026-08-06T00:00:00.000Z',
        finished_at: '2026-08-06T00:01:00.000Z',
        created_at: '2026-08-06T00:00:00.000Z',
        last_completed_scan_at: '2026-08-06T00:01:00.000Z',
        coverage_percent: '50.00'
      })
    const queryRows = vi.fn().mockResolvedValueOnce([{
      id: 'state-1',
      connection_id: 'connection-a',
      customer_id: '123',
      account_name: 'Account A',
      client_id: 'client-a',
      client_name: 'Client A',
      owner_id: 'owner-a',
      owner_name: 'Alex',
      campaign_id: '456',
      campaign_name: 'Generic Search',
      campaign_status: 'ENABLED',
      readiness_status: 'needs_review',
      migration_reason: 'aca',
      ai_max_enabled: true,
      effective_search_term_matching: 'partially_disabled',
      effective_text_customisation: 'enabled',
      effective_final_url_expansion: 'disabled',
      risk_flags: ['PARTIAL_SEARCH_MATCHING'],
      freshness_status: 'warning',
      last_observed_at: '2026-08-06T00:00:00.000Z',
      last_changed_at: '2026-08-06T00:00:00.000Z'
    }]).mockResolvedValueOnce([
      { kind: 'connection', value: 'connection-a', label: 'Account A' },
      { kind: 'client', value: 'client-a', label: 'Client A' }
    ])

    const result = await listGoogleAiMaxReadiness({
      tenantId: 'tenant-a',
      filters: {
        page: 2,
        pageSize: 25,
        status: 'needs_review',
        connectionId: 'connection-a',
        clientId: 'client-a',
        campaignStatus: 'ENABLED',
        migrationReason: 'aca',
        stale: 'warning',
        changedSince: '2026-08-01T00:00:00.000Z',
        search: 'Generic'
      }
    }, { queryOne, queryRows })

    expect(result.summary).toEqual({
      eligible: 3,
      affected: 2,
      enabled: 1,
      needsReview: 1,
      unknown: 1,
      changed: 2,
      lastCompletedScanAt: '2026-08-06T00:01:00.000Z',
      coveragePercent: 50
    })
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 3 })
    expect(result.facets).toEqual({
      connections: [{ label: 'Account A', value: 'connection-a' }],
      clients: [{ label: 'Client A', value: 'client-a' }]
    })
    expect(result.items[0]).toMatchObject({
      id: 'state-1',
      campaignName: 'Generic Search',
      client: { id: 'client-a', name: 'Client A' },
      owner: { id: 'owner-a', name: 'Alex' },
      readinessStatus: 'needs_review',
      freshness: 'warning',
      risks: ['PARTIAL_SEARCH_MATCHING', 'STALE_SCAN']
    })

    const summarySql = String(queryOne.mock.calls[0]?.[0])
    const itemSql = String(queryRows.mock.calls[0]?.[0])
    const facetsSql = String(queryRows.mock.calls[1]?.[0])
    for (const fragment of [
      's.tenant_id = $1',
      's.readiness_status',
      's.connection_id',
      'sc.client_id',
      's.campaign_status',
      's.migration_reason',
      'INTERVAL \'26 hours\'',
      's.last_changed_at',
      'ILIKE'
    ]) {
      expect(summarySql).toContain(fragment)
      expect(itemSql).toContain(fragment)
    }
    expect(queryRows.mock.calls[0]?.[1].slice(0, -2)).toEqual(queryOne.mock.calls[0]?.[1])
    expect(summarySql).toContain('THEN \'unknown\'')
    expect(facetsSql).toContain('WHERE s.tenant_id = $1')
  })
})

describe('listGoogleAiMaxReadinessForExport', () => {
  it('reuses readiness filters and fails closed above the export cap', async () => {
    const queryRows = vi.fn().mockResolvedValue(
      Array.from({ length: 5001 }, (_, index) => ({ id: `state-${index}` }))
    )

    await expect(listGoogleAiMaxReadinessForExport({
      tenantId: 'tenant-a',
      filters: {
        page: 1,
        pageSize: 25,
        status: 'needs_review',
        search: 'Generic'
      }
    }, { queryOne: vi.fn(), queryRows })).rejects.toThrow(
      'AI Max export exceeds 5000 rows'
    )

    const sql = String(queryRows.mock.calls[0]?.[0])
    expect(sql).toContain('s.tenant_id = $1')
    expect(sql).toContain('s.readiness_status')
    expect(sql).toContain('ILIKE')
    expect(sql).toContain('LIMIT')
    expect(queryRows.mock.calls[0]?.[1].at(-1)).toBe(5001)
  })
})

describe('getGoogleAiMaxReadinessDetail', () => {
  it('does not query events when the tenant-scoped state is absent', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    const queryRows = vi.fn()

    await expect(getGoogleAiMaxReadinessDetail(
      'tenant-a',
      '00000000-0000-4000-8000-000000000001',
      { queryOne, queryRows }
    )).resolves.toBeNull()
    expect(queryRows).not.toHaveBeenCalled()
    expect(queryOne.mock.calls[0]?.[1]).toEqual([
      'tenant-a',
      '00000000-0000-4000-8000-000000000001'
    ])
  })

  it('returns raw evidence, aggregate exceptions and a material timeline', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: 'state-1',
      connection_id: 'connection-a',
      customer_id: '123',
      account_name: 'Account A',
      client_id: null,
      client_name: null,
      owner_id: null,
      owner_name: null,
      campaign_id: '456',
      campaign_name: 'Generic Search',
      campaign_status: 'ENABLED',
      advertising_channel_type: 'SEARCH',
      bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
      keyword_match_type: 'BROAD',
      ai_max_enabled: true,
      bundling_required: 'NOT_REQUIRED',
      text_asset_automation_status: 'OPTED_IN',
      final_url_expansion_status: 'OPTED_OUT',
      ad_group_count: 3,
      search_term_matching_disabled_ad_group_count: 1,
      migration_reason: 'campaign_broad_match',
      readiness_status: 'needs_review',
      effective_readiness_status: 'unknown',
      risk_flags: ['PARTIAL_SEARCH_MATCHING'],
      freshness_status: 'critical',
      effective_search_term_matching: 'partially_disabled',
      effective_text_customisation: 'enabled',
      effective_final_url_expansion: 'disabled',
      deep_link: null,
      raw_evidence: { keywordMatchType: 'BROAD' },
      first_observed_at: '2026-08-05T00:00:00.000Z',
      last_observed_at: '2026-08-06T00:00:00.000Z',
      last_changed_at: '2026-08-06T00:00:00.000Z'
    })
    const queryRows = vi.fn().mockResolvedValue([{
      id: 'event-1',
      event_type: 'setting_changed',
      previous_value: { aiMaxEnabled: false },
      current_value: { aiMaxEnabled: true },
      observed_at: '2026-08-06T00:00:00.000Z'
    }])

    const result = await getGoogleAiMaxReadinessDetail(
      'tenant-a',
      '00000000-0000-4000-8000-000000000001',
      { queryOne, queryRows }
    )

    expect(result).toMatchObject({
      id: 'state-1',
      readinessStatus: 'unknown',
      freshness: 'critical',
      risks: ['PARTIAL_SEARCH_MATCHING', 'STALE_SCAN'],
      rawEvidence: { keywordMatchType: 'BROAD' },
      adGroups: { total: 3, searchTermMatchingDisabled: 1 },
      timeline: [{ id: 'event-1', eventType: 'setting_changed' }]
    })
  })
})
