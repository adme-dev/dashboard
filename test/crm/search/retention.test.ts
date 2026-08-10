import { describe, expect, it, vi } from 'vitest'
import {
  CRM_SEARCH_RETENTION_DEFAULTS,
  CRM_SEARCH_RETENTION_TARGETS,
  assessClientErasureSla,
  runCrmSearchRetention
} from '~~/server/utils/crm/search/retention'

const digest = (character: string) => character.repeat(64)

describe('CRM search governed retention', () => {
  it('pins the approved retention schedule', () => {
    expect(CRM_SEARCH_RETENTION_DEFAULTS).toEqual({
      detailedEventsDays: 30,
      dailyAggregatesDays: 180,
      usageAndRateCardsDays: 400,
      confirmedOperationsDays: 90,
      resolvedDeadLettersDays: 180,
      confirmedTombstonesAndTeardownsDays: 90,
      evaluationPolicyAndSecurityEvidenceDays: 730
    })
  })

  it('covers every single-approver table accepted by the governed expiry function', () => {
    expect(CRM_SEARCH_RETENTION_TARGETS.map(([target]) => target)).toEqual([
      'crm_search_schema_versions',
      'crm_search_rate_cards',
      'crm_search_rate_card_revocations',
      'crm_search_operations',
      'crm_search_provider_attempts',
      'crm_search_documents',
      'crm_search_usage_daily',
      'crm_search_usage_reservations',
      'crm_search_events',
      'crm_search_daily_events',
      'crm_search_evaluation_runs',
      'crm_search_evaluation_query_evidence',
      'crm_search_evaluation_approvals',
      'crm_search_evaluation_approval_revocations',
      'crm_search_evaluation_approval_consumptions',
      'crm_search_change_approvals',
      'crm_search_change_approval_revocations',
      'crm_search_change_approval_consumptions',
      'crm_search_audit_log',
      'crm_search_dead_letters',
      'crm_search_client_teardowns',
      'crm_search_teardown_vectors'
    ])
  })

  it('aggregates before bounded expiry and delegates deletion to the exact definer authority', async () => {
    const calls: string[] = []
    const dependencies = {
      aggregateDetailedEventsThrough: vi.fn(async () => { calls.push('aggregate') }),
      listRetentionBatches: vi.fn(async () => [{
        targetTable: 'crm_search_events',
        partitionName: 'crm_search_events_default',
        expireThrough: '2026-07-11T00:00:00.000Z',
        highWatermarkHash: digest('0'),
        deletionManifestHash: digest('1')
      }]),
      expireGovernedRows: vi.fn(async (input: unknown) => {
        calls.push('expire')
        return { rowCount: 10, complete: true, attestationHash: digest('2'), input }
      }),
      listRetiredAnalyticsKeys: vi.fn(async () => []),
      countRetainedEventsForKeyVersion: vi.fn(),
      destroyRetiredAnalyticsKey: vi.fn(),
      listPendingClientErasures: vi.fn(async () => []),
      emitAlert: vi.fn(),
      recordRetentionRun: vi.fn(async () => { calls.push('record') })
    }

    const result = await runCrmSearchRetention({
      now: '2026-08-10T00:00:00.000Z',
      executorId: 'retention-cron',
      batchLimit: 1_000
    }, dependencies as never)

    expect(calls).toEqual(['aggregate', 'expire', 'record'])
    expect(dependencies.expireGovernedRows).toHaveBeenCalledWith({
      targetTable: 'crm_search_events',
      partitionName: 'crm_search_events_default',
      expireThrough: '2026-07-11T00:00:00.000Z',
      expectedHighWatermarkHash: digest('0'),
      deletionManifestHash: digest('1'),
      executorId: 'retention-cron',
      batchLimit: 1_000
    })
    expect(result).toMatchObject({ deletedRows: 10, attestations: [digest('2')] })
    expect(JSON.stringify(result)).not.toMatch(/rawQuery|sourceText|query text/i)
  })

  it('does not reinterpret a legal hold as deletion success or advance a watermark', async () => {
    const recordRetentionRun = vi.fn()
    const dependencies = {
      aggregateDetailedEventsThrough: vi.fn(),
      listRetentionBatches: vi.fn(async () => [{
        targetTable: 'crm_search_events',
        partitionName: 'crm_search_events_default',
        expireThrough: '2026-07-11T00:00:00.000Z',
        highWatermarkHash: digest('0'),
        deletionManifestHash: digest('1')
      }]),
      expireGovernedRows: vi.fn(async () => ({
        rowCount: 0,
        complete: false,
        legalHoldBlockedCount: 1,
        attestationHash: digest('2')
      })),
      listRetiredAnalyticsKeys: vi.fn(async () => []),
      countRetainedEventsForKeyVersion: vi.fn(),
      destroyRetiredAnalyticsKey: vi.fn(),
      listPendingClientErasures: vi.fn(async () => []),
      emitAlert: vi.fn(),
      recordRetentionRun
    }

    const result = await runCrmSearchRetention({
      now: '2026-08-10T00:00:00.000Z',
      executorId: 'retention-cron',
      batchLimit: 1_000
    }, dependencies as never)

    expect(result).toMatchObject({ deletedRows: 0, complete: false, legalHoldBlockedCount: 1 })
    expect(recordRetentionRun).toHaveBeenCalledWith(expect.objectContaining({ complete: false }))
  })

  it('destroys a retired analytics HMAC key only after its final event reference expires', async () => {
    const destroyRetiredAnalyticsKey = vi.fn()
    const countRetainedEventsForKeyVersion = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    const base = {
      aggregateDetailedEventsThrough: vi.fn(),
      listRetentionBatches: vi.fn(async () => []),
      expireGovernedRows: vi.fn(),
      listRetiredAnalyticsKeys: vi.fn(async () => [
        { keyVersion: 'analytics-k1', retiredAt: '2026-06-01T00:00:00.000Z' },
        { keyVersion: 'analytics-k2', retiredAt: '2026-06-01T00:00:00.000Z' }
      ]),
      countRetainedEventsForKeyVersion,
      destroyRetiredAnalyticsKey,
      listPendingClientErasures: vi.fn(async () => []),
      emitAlert: vi.fn(),
      recordRetentionRun: vi.fn()
    }

    await runCrmSearchRetention({
      now: '2026-08-10T00:00:00.000Z', executorId: 'retention-cron', batchLimit: 1_000
    }, base as never)

    expect(destroyRetiredAnalyticsKey).toHaveBeenCalledTimes(1)
    expect(destroyRetiredAnalyticsKey).toHaveBeenCalledWith('analytics-k2', expect.objectContaining({
      reason: 'last_reference_expired'
    }))
    expect(destroyRetiredAnalyticsKey).not.toHaveBeenCalledWith('analytics-k1', expect.anything())
  })

  it.each([
    [14, 'on_target'],
    [60, 'warning'],
    [240, 'page'],
    [1_440, 'privacy_incident']
  ] as const)('maps an incomplete erasure at %i minutes to %s', (minutes, expected) => {
    expect(assessClientErasureSla({
      requestedAt: '2026-08-09T00:00:00.000Z',
      now: new Date(Date.parse('2026-08-09T00:00:00.000Z') + minutes * 60_000).toISOString(),
      databaseTombstoneRecorded: true,
      providerAbsenceConfirmed: false
    })).toMatchObject({ status: expected, complete: false })
  })

  it('reports erasure complete only with database evidence and provider absence confirmation', () => {
    expect(assessClientErasureSla({
      requestedAt: '2026-08-09T00:00:00.000Z',
      now: '2026-08-09T00:10:00.000Z',
      databaseTombstoneRecorded: true,
      providerAbsenceConfirmed: true
    })).toMatchObject({ status: 'complete', complete: true })
    expect(assessClientErasureSla({
      requestedAt: '2026-08-09T00:00:00.000Z',
      now: '2026-08-09T00:10:00.000Z',
      databaseTombstoneRecorded: true,
      providerAbsenceConfirmed: false
    })).toMatchObject({ complete: false })
  })

  it('alerts after 24 hours without a successful purge', async () => {
    const emitAlert = vi.fn()
    await runCrmSearchRetention({
      now: '2026-08-10T00:00:00.000Z', executorId: 'retention-cron', batchLimit: 1_000
    }, {
      aggregateDetailedEventsThrough: vi.fn(),
      listRetentionBatches: vi.fn(async () => []),
      expireGovernedRows: vi.fn(),
      listRetiredAnalyticsKeys: vi.fn(async () => []),
      countRetainedEventsForKeyVersion: vi.fn(),
      destroyRetiredAnalyticsKey: vi.fn(),
      listPendingClientErasures: vi.fn(async () => []),
      getLastSuccessfulPurgeAt: vi.fn(async () => '2026-08-08T23:59:59.000Z'),
      emitAlert,
      recordRetentionRun: vi.fn()
    } as never)

    expect(emitAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: 'page', reason: 'purge_stale_24h' }))
  })
})
