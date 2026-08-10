import { describe, expect, it, vi } from 'vitest'
import {
  CRM_SEARCH_RETENTION_DEFAULTS,
  CRM_SEARCH_RETENTION_TARGETS,
  assessClientErasureSla,
  createCrmSearchRetentionDependencies,
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

  it('expires FK children before parents for every governed relationship', () => {
    const targets = CRM_SEARCH_RETENTION_TARGETS.map(([target]) => target)
    expect(new Set(targets)).toEqual(new Set([
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
    ]))
    for (const [child, parent] of [
      ['crm_search_rate_card_revocations', 'crm_search_rate_cards'],
      ['crm_search_provider_attempts', 'crm_search_operations'],
      ['crm_search_usage_reservations', 'crm_search_provider_attempts'],
      ['crm_search_evaluation_query_evidence', 'crm_search_evaluation_runs'],
      ['crm_search_evaluation_approval_revocations', 'crm_search_evaluation_approvals'],
      ['crm_search_evaluation_approval_consumptions', 'crm_search_evaluation_approvals'],
      ['crm_search_evaluation_approvals', 'crm_search_evaluation_runs'],
      ['crm_search_change_approval_revocations', 'crm_search_change_approvals'],
      ['crm_search_change_approval_consumptions', 'crm_search_change_approvals'],
      ['crm_search_teardown_vectors', 'crm_search_client_teardowns']
    ]) {
      expect(targets.indexOf(child), `${child} must precede ${parent}`).toBeLessThan(targets.indexOf(parent))
    }
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
    const retireAnalyticsKeyIfUnreferenced = vi.fn()
      .mockResolvedValueOnce({ retired: false })
      .mockResolvedValueOnce({ retired: true, receiptSha256: digest('f') })
    const base = {
      aggregateDetailedEventsThrough: vi.fn(),
      listRetentionBatches: vi.fn(async () => []),
      expireGovernedRows: vi.fn(),
      listRetiredAnalyticsKeys: vi.fn(async () => [
        { keyVersion: 'analytics-k1', retiredAt: '2026-06-01T00:00:00.000Z' },
        { keyVersion: 'analytics-k2', retiredAt: '2026-06-01T00:00:00.000Z' }
      ]),
      retireAnalyticsKeyIfUnreferenced,
      listPendingClientErasures: vi.fn(async () => []),
      emitAlert: vi.fn(),
      recordRetentionRun: vi.fn()
    }

    await runCrmSearchRetention({
      now: '2026-08-10T00:00:00.000Z', executorId: 'retention-cron', batchLimit: 1_000
    }, base as never)

    expect(retireAnalyticsKeyIfUnreferenced).toHaveBeenCalledTimes(2)
    expect(retireAnalyticsKeyIfUnreferenced).toHaveBeenCalledWith('analytics-k2', expect.objectContaining({
      reason: 'last_reference_expired', executorId: 'retention-cron'
    }))
    expect(retireAnalyticsKeyIfUnreferenced).toHaveBeenCalledWith('analytics-k1', expect.anything())
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

  it('fails closed before retention when production alert or key-manager bindings are absent', () => {
    expect(() => createCrmSearchRetentionDependencies({ context: { cloudflare: { env: {} } } } as never))
      .toThrow(/binding|transport|manager/i)
  })

  it('uses exact Cloudflare bindings for alerts and fenced key retirement', async () => {
    const send = vi.fn(async () => undefined)
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'destroyed', receiptSha256: digest('f')
    }), { headers: { 'content-type': 'application/json' } }))
    const dependencies = createCrmSearchRetentionDependencies({ context: { cloudflare: { env: {
      CRM_SEARCH_RETENTION_ALERTS: { send },
      CRM_SEARCH_ANALYTICS_KEY_MANAGER: { fetch }
    } } } } as never, {
      retireAnalyticsKeyIfUnreferenced: vi.fn(async () => ({ retired: true, receiptSha256: digest('f') }))
    } as never)

    await dependencies.emitAlert({ severity: 'page', reason: 'purge_stale_24h' })
    expect(send).toHaveBeenCalledWith({
      version: 'crm-search-retention-alert-v1', severity: 'page', reason: 'purge_stale_24h'
    })
  })

  it('holds the database fence across mandatory key-manager destruction and durable recording', async () => {
    const steps: string[] = []
    const managerFetch = vi.fn(async () => {
      steps.push('manager')
      return new Response(JSON.stringify({ status: 'destroyed', receiptSha256: digest('f') }), {
        headers: { 'content-type': 'application/json' }
      })
    })
    const transaction = vi.fn(async (callback: (database: { query: (sql: string) => Promise<unknown> }) => Promise<unknown>) => callback({
      async query(sql: string) {
        if (sql.includes('pg_advisory_xact_lock')) steps.push('fence')
        if (sql.includes('FROM crm_search_analytics_key_retirements')) return { rows: [] }
        if (sql.includes('COUNT(*)')) {
          steps.push('references')
          return { rows: [{ count: '0' }] }
        }
        if (sql.includes('crm_search_record_analytics_key_retirement')) {
          steps.push('record')
          return { rows: [{ id: '10000000-0000-4000-8000-000000000001' }] }
        }
        return { rows: [] }
      }
    }))
    const dependencies = createCrmSearchRetentionDependencies({ context: { cloudflare: { env: {
      CRM_SEARCH_RETENTION_ALERTS: { send: vi.fn() },
      CRM_SEARCH_ANALYTICS_KEY_MANAGER: { fetch: managerFetch }
    } } } } as never, { transaction } as never)

    await expect(dependencies.retireAnalyticsKeyIfUnreferenced('analytics-k1', {
      reason: 'last_reference_expired',
      now: '2026-08-10T00:00:00.000Z',
      executorId: '10000000-0000-4000-8000-000000000002'
    })).resolves.toEqual({ retired: true, receiptSha256: digest('f') })
    expect(steps).toEqual(['fence', 'references', 'manager', 'record'])
  })
})
