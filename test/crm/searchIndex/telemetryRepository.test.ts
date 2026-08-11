import { describe, expect, it, vi } from 'vitest'
import type { CrmSearchTelemetryEvent } from '~~/server/utils/crm/searchIndex/telemetry'
import { persistCrmSearchTelemetry } from '~~/server/utils/crm/searchIndex/telemetryRepository'

const event: CrmSearchTelemetryEvent = {
  organisationScopeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  correlationId: '33333333-3333-4333-8333-333333333333',
  eventType: 'search.shadow_completed',
  actorType: 'staff',
  mode: 'shadow',
  surface: 'agency_global',
  sampled: true,
  queryDigest: `hmac-sha256:${'a'.repeat(64)}`,
  queryDigestKeyVersion: 'k1',
  queryLengthBucket: '17_32',
  keywordResultCount: 2,
  semanticCandidateCount: 3,
  fusedResultCount: 2,
  rankEvidence: {
    overlapCount: 1,
    orderingChanged: false,
    thresholdRevision: 'cosine-0.75-v1'
  },
  keywordLatencyMs: 10,
  embeddingLatencyMs: 20,
  vectorLatencyMs: 30,
  joinBackLatencyMs: 15,
  totalLatencyMs: 75,
  fallbackClass: 'none',
  statusClass: 'shadow_completed'
}

describe('CRM search telemetry repository', () => {
  it('writes exact privacy-safe structured event columns and a bounded daily aggregate atomically', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444' }] })
      .mockResolvedValueOnce({ rows: [{ id: '55555555-5555-4555-8555-555555555555' }] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    await expect(persistCrmSearchTelemetry({
      event,
      aggregate: {
        eventDate: '2026-08-10',
        eligibleCount: 1,
        sampledCount: 1,
        requestCount: 1,
        fallbackCount: 0,
        timeoutCount: 0,
        lateBilledCompletionCount: 0,
        latencyCount: 1,
        latencySumMs: 75,
        latencyMaxMs: 75
      }
    }, { transactionWithoutRetry } as never)).resolves.toMatchObject({
      eventId: expect.any(String),
      aggregateId: expect.any(String)
    })

    const eventSql = query.mock.calls[0]?.[0] as string
    const aggregateSql = query.mock.calls[1]?.[0] as string
    expect(eventSql).toContain('INSERT INTO crm_search_events')
    expect(eventSql).not.toMatch(/raw_query|source_text|provider_error|request_url/i)
    expect(query.mock.calls[0]?.[1]).toContain(event.queryDigest)
    expect(aggregateSql).toContain('INSERT INTO crm_search_daily_events')
    expect(aggregateSql).not.toMatch(/query_digest|correlation_id|actor_id/i)
  })

  it('rejects raw query or source/provider fields even when smuggled onto an otherwise valid event', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(persistCrmSearchTelemetry({
      event: { ...event, rawQuery: 'Confidential account name' } as never,
      aggregate: null
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_telemetry_unsafe')
    await expect(persistCrmSearchTelemetry({
      event: { ...event, providerError: 'full provider response' } as never,
      aggregate: null
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_telemetry_unsafe')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })

  it('requires HMAC-scoped query and entity rank digests before persistence', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(persistCrmSearchTelemetry({
      event: {
        ...event,
        rankEvidence: {
          keywordRanks: [{ entityType: 'company', entityIdDigest: 'a'.repeat(64), rank: 1 }]
        }
      },
      aggregate: null
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_telemetry_unsafe')
  })

  it('applies the PostgreSQL JSONB text-size ceiling before starting a transaction', async () => {
    const rankEntry = (rank: number) => ({
      entityType: 'company' as const,
      entityIdDigest: `hmac-sha256:${'a'.repeat(64)}`,
      rank,
      scoreBucket: 100
    })
    const transactionWithoutRetry = vi.fn()
    await expect(persistCrmSearchTelemetry({
      event: {
        ...event,
        rankEvidence: {
          keywordRanks: Array.from({ length: 47 }, (_, index) => rankEntry(index + 1)),
          semanticRanks: Array.from({ length: 5 }, (_, index) => rankEntry(index + 1)),
          overlapCount: 50,
          orderingChanged: true,
          abstained: false,
          thresholdRevision: 'cosine-0.75-v1',
          resultCount: 50,
          reasonClass: 'none'
        }
      },
      aggregate: null
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_telemetry_unsafe')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })

  it('fails closed when daily aggregate counts are inconsistent or unbounded', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(persistCrmSearchTelemetry({
      event,
      aggregate: {
        eventDate: '2026-08-10',
        eligibleCount: 0,
        sampledCount: 1,
        requestCount: 1,
        fallbackCount: 0,
        timeoutCount: 0,
        lateBilledCompletionCount: 0,
        latencyCount: 1,
        latencySumMs: 75,
        latencyMaxMs: 75
      }
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_telemetry_invalid_aggregate')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })
})
