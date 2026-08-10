import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_METRIC_LABEL_KEYS,
  CRM_SEARCH_RANK_REASON_CLASSES,
  CRM_SEARCH_THRESHOLD_REVISIONS,
  buildCrmSearchMetricLabels,
  createCrmSearchTelemetryEvent,
  deriveCrmSearchEntityIdDigest,
  deriveCrmSearchQueryDigest,
  queryLengthBucket
} from '~~/server/utils/crm/searchIndex/telemetry'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const correlationId = '33333333-3333-4333-8333-333333333333'
const digestSecret = 'test-only-dedicated-query-digest-key-32-bytes-minimum'

describe('CRM search privacy-safe telemetry', () => {
  it('derives a stable HMAC-SHA-256 digest over the normalized, scoped query', async () => {
    const first = await deriveCrmSearchQueryDigest({
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      query: '  Ａｌｅｘ\tMotors  '
    })
    const normalizedEquivalent = await deriveCrmSearchQueryDigest({
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      query: 'Alex Motors'
    })

    expect(first).toBe(normalizedEquivalent)
    expect(first).toBe('hmac-sha256:4587614a4729c3807852d0b6f2ccc42f7401d057a6d3728873d4fe6d6a76bffc')
    expect(first).toMatch(/^hmac-sha256:[a-f0-9]{64}$/)
    expect(first).not.toMatch(/alex|motors/i)
  })

  it('domain-separates the key version, organisation, and client identity', async () => {
    const base = {
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      query: 'fleet renewal'
    }
    const digests = await Promise.all([
      deriveCrmSearchQueryDigest(base),
      deriveCrmSearchQueryDigest({ ...base, keyVersion: 'analytics-k2' }),
      deriveCrmSearchQueryDigest({ ...base, organisationScopeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      deriveCrmSearchQueryDigest({ ...base, clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      deriveCrmSearchQueryDigest({ ...base, query: 'fleet disposal' })
    ])

    expect(new Set(digests).size).toBe(digests.length)
  })

  it('derives a scoped, domain-separated HMAC for entity rank evidence', async () => {
    const digest = await deriveCrmSearchEntityIdDigest({
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      entityType: 'company',
      entityId: '44444444-4444-4444-8444-444444444444'
    })
    const otherEntity = await deriveCrmSearchEntityIdDigest({
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      entityType: 'company',
      entityId: '55555555-5555-4555-8555-555555555555'
    })

    expect(digest).toMatch(/^hmac-sha256:[a-f0-9]{64}$/)
    expect(digest).not.toBe(otherEntity)
  })

  it('fails closed for a blank query, malformed key version, or undersized HMAC secret', async () => {
    await expect(deriveCrmSearchQueryDigest({
      secret: digestSecret,
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      query: ' \u202e '
    })).rejects.toThrow(/query/i)
    await expect(deriveCrmSearchQueryDigest({
      secret: digestSecret,
      keyVersion: 'bad key version',
      organisationScopeId,
      clientId,
      query: 'Alex'
    })).rejects.toThrow(/key version/i)
    await expect(deriveCrmSearchQueryDigest({
      secret: 'short',
      keyVersion: 'analytics-k1',
      organisationScopeId,
      clientId,
      query: 'Alex'
    })).rejects.toThrow(/32 bytes/i)
  })

  it.each([
    [1, '1_16'],
    [16, '1_16'],
    [17, '17_32'],
    [33, '33_64'],
    [65, '65_128'],
    [129, '129_256'],
    [256, '129_256']
  ] as const)('buckets %i normalized code points as %s', (length, expected) => {
    expect(queryLengthBucket('😀'.repeat(length))).toBe(expected)
  })

  it('projects a checked event row without retaining raw query, URL, provider errors, or source text', async () => {
    const event = await createCrmSearchTelemetryEvent({
      organisationScopeId,
      clientId,
      correlationId,
      eventType: 'search.fallback',
      actorType: 'staff',
      mode: 'assist',
      surface: 'agency_ai',
      sampled: false,
      query: '  confidential fleet renewal  ',
      digestKey: { secret: digestSecret, keyVersion: 'analytics-k1' },
      keywordResultCount: 4,
      semanticCandidateCount: 3,
      fusedResultCount: 4,
      rankEvidence: {
        keywordRanks: [{
          entityType: 'company',
          entityIdDigest: `hmac-sha256:${'b'.repeat(64)}`,
          rank: 1,
          scoreBucket: 80
        }],
        overlapCount: 2,
        orderingChanged: false,
        abstained: true,
        thresholdRevision: 'cosine-0.75-v1',
        resultCount: 4,
        reasonClass: 'deadline'
      },
      latencyMs: {
        keyword: 12,
        embedding: 200,
        vector: 100,
        joinBack: 50,
        total: 500
      },
      fallbackClass: 'deadline',
      statusClass: 'fallback',
      rawUrl: 'https://example.invalid/search?q=confidential',
      providerError: 'private provider body',
      sourceText: 'private CRM notes'
    } as never)

    expect(event).toMatchObject({
      organisationScopeId,
      clientId,
      correlationId,
      eventType: 'search.fallback',
      queryDigestKeyVersion: 'analytics-k1',
      queryLengthBucket: '17_32',
      keywordResultCount: 4,
      semanticCandidateCount: 3,
      fusedResultCount: 4,
      fallbackClass: 'deadline',
      statusClass: 'fallback'
    })
    expect(event.queryDigest).toMatch(/^hmac-sha256:[a-f0-9]{64}$/)
    expect(event.rankEvidence.keywordRanks?.[0]?.entityIdDigest).toMatch(/^hmac-sha256:/)
    expect(JSON.stringify(event)).not.toMatch(/confidential|example\.invalid|provider body|CRM notes/i)
    expect(event).not.toHaveProperty('query')
    expect(event).not.toHaveProperty('rawUrl')
    expect(event).not.toHaveProperty('providerError')
    expect(event).not.toHaveProperty('sourceText')
  })

  it('projects late-completion telemetry from precomputed HMAC context without retaining a raw query', async () => {
    const common = {
      organisationScopeId,
      clientId,
      correlationId,
      actorType: 'system',
      mode: 'assist',
      surface: 'agency_ai',
      sampled: false,
      keywordResultCount: 4,
      semanticCandidateCount: 3,
      fusedResultCount: 4,
      rankEvidence: {},
      latencyMs: { total: 500 },
      fallbackClass: 'deadline',
      statusClass: 'fallback'
    } as const
    const queryDigestContext = {
      queryDigest: `hmac-sha256:${'c'.repeat(64)}`,
      queryDigestKeyVersion: 'analytics-k1',
      queryLengthBucket: '17_32'
    } as const
    const event = await createCrmSearchTelemetryEvent({
      ...common,
      eventType: 'provider.late_completion',
      queryDigestContext
    })

    expect(event).toMatchObject(queryDigestContext)
    expect(event).not.toHaveProperty('query')
    expect(event).not.toHaveProperty('digestKey')

    await expect(createCrmSearchTelemetryEvent({
      ...common,
      eventType: 'provider.late_completion',
      query: 'confidential fleet renewal',
      digestKey: { secret: digestSecret, keyVersion: 'analytics-k1' }
    })).rejects.toThrow(/precomputed/i)
    await expect(createCrmSearchTelemetryEvent({
      ...common,
      eventType: 'search.fallback',
      queryDigestContext: {
        ...queryDigestContext,
        queryDigest: `hmac-sha256:${'e'.repeat(64)}`
      }
    })).rejects.toThrow(/raw query/i)
  })

  it('rejects event enum drift, unbounded counts, and unsafe rank evidence', async () => {
    const valid = {
      organisationScopeId,
      clientId,
      correlationId,
      eventType: 'search.keyword_only',
      actorType: 'staff',
      mode: 'off',
      surface: 'agency_global',
      sampled: false,
      query: 'Alex',
      digestKey: { secret: digestSecret, keyVersion: 'analytics-k1' },
      keywordResultCount: 1,
      semanticCandidateCount: 0,
      fusedResultCount: 0,
      rankEvidence: {},
      latencyMs: { keyword: 1, total: 1 },
      fallbackClass: 'mode_off',
      statusClass: 'keyword_only'
    } as const

    await expect(createCrmSearchTelemetryEvent({ ...valid, eventType: 'search.alex@example.invalid' } as never))
      .rejects.toThrow(/event type/i)
    await expect(createCrmSearchTelemetryEvent({ ...valid, keywordResultCount: 51 }))
      .rejects.toThrow(/result count/i)
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      latencyMs: { total: 2_147_483_648 }
    })).rejects.toThrow(/latency/i)
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      rankEvidence: { rawTitle: 'Private account' } as never
    })).rejects.toThrow(/rank evidence/i)
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      rankEvidence: {
        keywordRanks: [{ entityType: 'person', entityIdDigest: 'd'.repeat(64), rank: 1 }]
      }
    })).rejects.toThrow(/rank evidence/i)
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      rankEvidence: { reasonClass: 'ConfidentialAccountName' }
    })).rejects.toThrow(/rank evidence/i)
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      rankEvidence: { thresholdRevision: 'caller-controlled-threshold' }
    })).rejects.toThrow(/rank evidence/i)
    const fullRankList = Array.from({ length: 50 }, (_, index) => ({
      entityType: 'person' as const,
      entityIdDigest: `hmac-sha256:${index.toString(16).padStart(64, '0')}`,
      rank: index + 1,
      scoreBucket: 100
    }))
    await expect(createCrmSearchTelemetryEvent({
      ...valid,
      rankEvidence: {
        keywordRanks: fullRankList,
        semanticRanks: fullRankList,
        fusedRanks: fullRankList
      }
    })).rejects.toThrow(/rank evidence size/i)
  })

  it('pins bounded rank-evidence reason and threshold revisions', () => {
    expect(CRM_SEARCH_THRESHOLD_REVISIONS).toEqual(['cosine-0.75-v1'])
    expect(CRM_SEARCH_RANK_REASON_CLASSES).toContain('deadline')
    expect(CRM_SEARCH_RANK_REASON_CLASSES).toContain('unauthorized_candidate')
  })

  it('emits only allowlisted bounded metric labels', () => {
    expect(CRM_SEARCH_METRIC_LABEL_KEYS).toEqual([
      'mode', 'surface', 'entityType', 'provider', 'statusClass', 'fallbackClass'
    ])
    expect(buildCrmSearchMetricLabels({
      mode: 'shadow',
      surface: 'agency_global',
      entityType: 'company',
      provider: 'vectorize',
      statusClass: 'shadow_completed',
      fallbackClass: 'none'
    })).toEqual({
      mode: 'shadow',
      surface: 'agency_global',
      entityType: 'company',
      provider: 'vectorize',
      statusClass: 'shadow_completed',
      fallbackClass: 'none'
    })
  })

  it.each([
    ['client identifier', { mode: 'off', clientId }],
    ['actor identifier', { mode: 'off', actorId: clientId }],
    ['query digest', { mode: 'off', queryDigest: `hmac-sha256:${'a'.repeat(64)}` }],
    ['correlation identifier', { mode: 'off', correlationId }],
    ['URL', { mode: 'off', url: 'https://example.invalid' }],
    ['error text', { mode: 'off', error: 'provider failed' }],
    ['unbounded enum value', { mode: 'off', provider: 'https://provider.invalid' }]
  ])('rejects %s as a metric label', (_case, labels) => {
    expect(() => buildCrmSearchMetricLabels(labels)).toThrow(/metric label/i)
  })
})
