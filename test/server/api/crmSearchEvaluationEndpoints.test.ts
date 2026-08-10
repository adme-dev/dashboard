import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const RUN_ID = '10000000-0000-4000-8000-000000000003'
const ARTIFACT_ID = '10000000-0000-4000-8000-000000000004'
const ORGANISATION_SCOPE_ID = '10000000-0000-4000-8000-000000000005'
const digest = (character: string) => character.repeat(64)

const { createCrmSearchEvaluationPostHandler } = await import(
  '~~/server/api/admin/crm-search/evaluations/index.post'
)
const { createCrmSearchEvaluationGetHandler } = await import(
  '~~/server/api/admin/crm-search/evaluations/[id].get'
)

function validBody() {
  return {
    fixtureVersion: 'crm-search-evaluation-v1',
    sealedArtifactId: ARTIFACT_ID,
    datasetSha256: digest('a'),
    sealedJudgementSha256: digest('b'),
    preregistrationSha256: digest('c'),
    adjudicationSha256: digest('d'),
    implementationGitSha: 'e'.repeat(40),
    artifactManifestDigest: digest('f'),
    pagesBundleDigest: digest('1'),
    workerBundleDigest: digest('2'),
    bindingManifestDigest: digest('3'),
    schemaVersion: 'crm-search-v1',
    modelId: '@cf/baai/bge-base-en-v1.5',
    tokenizerRevision: 'bge-base-en-v1.5-pinned',
    rankingRevision: 'rrf-v1',
    thresholdRevision: 'cosine-0.75-v1',
    reason: 'Run the frozen CRM search evaluation evidence.'
  }
}

describe('CRM search evaluation admin endpoints', () => {
  const requireFreshAdmin = vi.fn()
  const readBody = vi.fn()
  const getRouterParam = vi.fn()
  const setResponseHeader = vi.fn()
  const setResponseStatus = vi.fn()
  const startEvaluation = vi.fn()
  const getEvaluation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requireFreshAdmin.mockResolvedValue({
      actorId: ACTOR_ID,
      orgId: ORGANISATION_SCOPE_ID,
      permissions: ['ADMIN'],
      authorityRevision: 'fresh-admin-1'
    })
    readBody.mockResolvedValue(validBody())
    getRouterParam.mockReturnValue(RUN_ID)
    startEvaluation.mockResolvedValue({ id: RUN_ID, gatePassed: false })
    getEvaluation.mockResolvedValue({ id: RUN_ID, gatePassed: false, metricBundle: {} })
  })

  const event = () => ({ context: {} } as never)

  it.each([
    ['unauthenticated', 401],
    ['non-admin', 403]
  ])('rejects %s before evaluation material is read', async (_label, statusCode) => {
    requireFreshAdmin.mockRejectedValue(Object.assign(new Error('denied'), { statusCode }))
    const handler = createCrmSearchEvaluationPostHandler({
      requireFreshAdmin, readBody, setResponseHeader, setResponseStatus, startEvaluation
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode })
    expect(readBody).not.toHaveBeenCalled()
    expect(startEvaluation).not.toHaveBeenCalled()
  })

  it('derives the runner only from the fresh signed ADMIN session', async () => {
    const handler = createCrmSearchEvaluationPostHandler({
      requireFreshAdmin, readBody, setResponseHeader, setResponseStatus, startEvaluation
    })

    await expect(handler(event())).resolves.toMatchObject({ id: RUN_ID })
    expect(startEvaluation).toHaveBeenCalledWith(validBody(), ACTOR_ID, expect.anything())
    expect(requireFreshAdmin).toHaveBeenCalledOnce()
  })

  it.each(['gatePassed', 'metrics', 'queryEvidence', 'rawQuery', 'policyMode', 'approvedEvaluationRunId'])(
    'rejects caller-submitted %s without starting a run',
    async (field) => {
      readBody.mockResolvedValue({ ...validBody(), [field]: field === 'gatePassed' ? true : {} })
      const handler = createCrmSearchEvaluationPostHandler({
        requireFreshAdmin, readBody, setResponseHeader, setResponseStatus, startEvaluation
      })

      await expect(handler(event())).rejects.toMatchObject({ statusCode: 422 })
      expect(startEvaluation).not.toHaveBeenCalled()
    }
  )

  it('returns uncached immutable evidence and never invokes rollout mutation', async () => {
    const transitionPolicy = vi.fn()
    const currentEvent = event()
    const handler = createCrmSearchEvaluationGetHandler({
      requireFreshAdmin, getRouterParam, setResponseHeader,
      getEvaluation, transitionPolicy
    } as never)

    await expect(handler(currentEvent)).resolves.toMatchObject({ id: RUN_ID, gatePassed: false })
    expect(requireFreshAdmin).toHaveBeenCalledWith(currentEvent)
    expect(getEvaluation).toHaveBeenCalledWith(RUN_ID, ORGANISATION_SCOPE_ID)
    expect(setResponseHeader).toHaveBeenCalledWith(currentEvent, 'Cache-Control', 'private, no-store')
    expect(transitionPolicy).not.toHaveBeenCalled()
  })

  it('sanitizes repository failures without leaking labels, SQL, or raw queries', async () => {
    getEvaluation.mockRejectedValue(new Error('SELECT secret_label FROM holdout WHERE raw_query = acquisition'))
    const handler = createCrmSearchEvaluationGetHandler({
      requireFreshAdmin, getRouterParam, setResponseHeader, getEvaluation
    })

    const failure = await handler(event()).catch((error: unknown) => error)
    expect(failure).toMatchObject({ statusCode: 500, data: { code: 'crm_search_evaluation_read_failed' } })
    expect(JSON.stringify(failure)).not.toMatch(/secret_label|SELECT|raw_query|acquisition/i)
  })

  it('rejects a stale ADMIN session before reading a route id or evaluation storage', async () => {
    requireFreshAdmin.mockRejectedValue(Object.assign(new Error('invalidated'), { statusCode: 401 }))
    const handler = createCrmSearchEvaluationGetHandler({
      requireFreshAdmin, getRouterParam, setResponseHeader, getEvaluation
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(getRouterParam).not.toHaveBeenCalled()
    expect(getEvaluation).not.toHaveBeenCalled()
  })
})

describe('CRM search retention cron endpoint', () => {
  const cronEvent = () => ({ context: {} } as never)

  it('fails closed before retention work when the cron secret does not match', async () => {
    const { createCrmSearchRetentionPostHandler } = await import(
      '~~/server/api/cron/crm-search-retention.post'
    )
    const retain = vi.fn()
    const handler = createCrmSearchRetentionPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'wrong-secret',
      resolveExecutorId: () => ACTOR_ID,
      retain
    })

    await expect(handler(cronEvent())).rejects.toMatchObject({ statusCode: 401 })
    expect(retain).not.toHaveBeenCalled()
  })

  it('runs one fixed bounded count-only retention pass after authentication', async () => {
    const { createCrmSearchRetentionPostHandler } = await import(
      '~~/server/api/cron/crm-search-retention.post'
    )
    const retain = vi.fn(async () => ({
      deletedRows: 10,
      attestations: [digest('a')],
      complete: true,
      legalHoldBlockedCount: 0,
      destroyedAnalyticsKeyVersions: ['analytics-k1'],
      erasureAlerts: 0
    }))
    const handler = createCrmSearchRetentionPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      resolveExecutorId: () => ACTOR_ID,
      now: () => '2026-08-10T00:00:00.000Z',
      retain
    })
    const currentEvent = cronEvent()

    await expect(handler(currentEvent)).resolves.toEqual({
      deletedRows: 10,
      attestationCount: 1,
      complete: true,
      legalHoldBlockedCount: 0,
      destroyedAnalyticsKeyCount: 1,
      erasureAlerts: 0
    })
    expect(retain).toHaveBeenCalledWith(currentEvent, {
      now: '2026-08-10T00:00:00.000Z',
      executorId: ACTOR_ID,
      batchLimit: 1_000
    })
  })

  it('rejects hostile retention results instead of serializing secret material', async () => {
    const { createCrmSearchRetentionPostHandler } = await import(
      '~~/server/api/cron/crm-search-retention.post'
    )
    const handler = createCrmSearchRetentionPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      resolveExecutorId: () => ACTOR_ID,
      retain: async () => ({ deletedRows: 1, rawQuery: 'secret acquisition' }) as never
    })

    const failure = await handler(cronEvent()).catch((error: unknown) => error)
    expect(failure).toMatchObject({ statusCode: 503 })
    expect(JSON.stringify(failure)).not.toMatch(/secret acquisition|rawQuery/i)
  })

  it('is registered on the existing daily Pages cron schedule', () => {
    const worker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
    expect(worker).toMatch(/'35 3 \* \* \*': \[[^\]]*'\/api\/cron\/crm-search-retention'/s)
  })
})
