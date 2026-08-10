import { describe, expect, it, vi } from 'vitest'
import { recordCrmSearchEvaluationRun } from '~~/server/utils/crm/search/evaluation/repository'
import { runCrmSearchEvaluation } from '~~/server/utils/crm/search/evaluation/runner'
import { unsealCrmSearchHoldout } from '~~/server/utils/crm/search/evaluation/sealedArtifact'

const digest = (character: string) => character.repeat(64)

describe('governed CRM search evaluation runner', () => {
  it('freezes candidate selection before unsealing labels and persists granular evidence for server recomputation', async () => {
    const calls: string[] = []
    const dependencies = {
      loadCheckedInFixtures: vi.fn(async () => {
        calls.push('load')
        return { developmentQueryCount: 180, holdoutManifestQueryCount: 360 }
      }),
      freezePreregistration: vi.fn(async () => {
        calls.push('freeze')
        return { sha256: digest('a'), frozenAt: '2026-08-10T00:00:00.000Z' }
      }),
      unsealHoldout: vi.fn(async () => {
        calls.push('unseal')
        return { sealedJudgementSha256: digest('b'), queries: [{ queryKeyDigest: digest('1') }] }
      }),
      executeGranularQueries: vi.fn(async () => {
        calls.push('execute')
        return [{
          queryKeyDigest: digest('1'),
          clientKeyDigest: digest('2'),
          entityType: 'company',
          strata: ['natural_language'],
          keywordResults: [],
          assistResults: [],
          judgements: []
        }]
      }),
      recordEvaluationRun: vi.fn(async (input: unknown) => {
        calls.push('record')
        return { id: 'run-1', gatePassed: false, input }
      })
    }

    const result = await runCrmSearchEvaluation({
      fixtureVersion: 'crm-search-evaluation-v1',
      sealedArtifactId: 'artifact-1',
      implementationGitSha: 'c'.repeat(40),
      schemaVersion: 'crm-search-v1',
      requestedBy: 'runner-1'
    }, dependencies as never)

    expect(calls).toEqual(['load', 'freeze', 'unseal', 'execute', 'record'])
    expect(result).toMatchObject({ id: 'run-1', gatePassed: false })
    expect(dependencies.recordEvaluationRun).toHaveBeenCalledWith(expect.objectContaining({
      runnerId: 'runner-1',
      developmentQueryCount: 180,
      queryEvidence: expect.arrayContaining([expect.objectContaining({ queryKeyDigest: digest('1') })])
    }))
    const persisted = dependencies.recordEvaluationRun.mock.calls[0]?.[0] as Record<string, unknown>
    expect(persisted).not.toHaveProperty('gatePassed')
    expect(persisted).not.toHaveProperty('metrics')
    expect(persisted).not.toHaveProperty('policyMode')
  })

  it.each(['gatePassed', 'metrics', 'queryEvidence', 'policyMode', 'clientPolicy'])(
    'rejects caller-submitted %s before unsealing or persistence',
    async (field) => {
      const unsealHoldout = vi.fn()
      const recordEvaluationRun = vi.fn()

      await expect(runCrmSearchEvaluation({
        fixtureVersion: 'crm-search-evaluation-v1',
        sealedArtifactId: 'artifact-1',
        implementationGitSha: 'c'.repeat(40),
        schemaVersion: 'crm-search-v1',
        requestedBy: 'runner-1',
        [field]: field === 'gatePassed' ? true : {}
      } as never, {
        loadCheckedInFixtures: vi.fn(),
        freezePreregistration: vi.fn(),
        unsealHoldout,
        executeGranularQueries: vi.fn(),
        recordEvaluationRun
      } as never)).rejects.toThrow(/caller|submitted|unknown/i)

      expect(unsealHoldout).not.toHaveBeenCalled()
      expect(recordEvaluationRun).not.toHaveBeenCalled()
    }
  )

  it('never exposes sealed labels or raw query text in its result', async () => {
    const dependencies = {
      loadCheckedInFixtures: vi.fn(async () => ({ developmentQueryCount: 180, holdoutManifestQueryCount: 360 })),
      freezePreregistration: vi.fn(async () => ({ sha256: digest('a'), frozenAt: '2026-08-10T00:00:00.000Z' })),
      unsealHoldout: vi.fn(async () => ({
        sealedJudgementSha256: digest('b'),
        rawQuery: 'confidential acquisition',
        queries: [{ queryKeyDigest: digest('1'), judgement: 'secret label' }]
      })),
      executeGranularQueries: vi.fn(async () => []),
      recordEvaluationRun: vi.fn(async () => ({ id: 'run-1', gatePassed: false }))
    }

    const result = await runCrmSearchEvaluation({
      fixtureVersion: 'crm-search-evaluation-v1',
      sealedArtifactId: 'artifact-1',
      implementationGitSha: 'c'.repeat(40),
      schemaVersion: 'crm-search-v1',
      requestedBy: 'runner-1'
    }, dependencies as never)

    expect(JSON.stringify(result)).not.toMatch(/confidential acquisition|secret label/i)
  })
})

describe('CRM search governed evidence adapters', () => {
  it('delegates granular evidence to the migration recorder without a pass flag or metric bundle', async () => {
    const queryOne = vi.fn()
      .mockResolvedValueOnce({ id: '10000000-0000-4000-8000-000000000010' })
      .mockResolvedValueOnce({
        id: '10000000-0000-4000-8000-000000000010',
        gate_passed: false,
        metric_bundle: { queryCount: 1 },
        created_at: new Date('2026-08-10T00:00:00.000Z'),
        expires_at: new Date('2026-08-12T00:00:00.000Z')
      })
    const ids = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)

    await expect(recordCrmSearchEvaluationRun({
      organisationScopeId: ids[0]!,
      schemaVersion: 'crm-search-v1',
      datasetVersion: 'development-v1',
      datasetSha256: digest('1'),
      sealedJudgementSha256: digest('2'),
      preregistrationSha256: digest('3'),
      adjudicationSha256: digest('4'),
      implementationGitSha: '5'.repeat(40),
      artifactManifestDigest: digest('6'),
      pagesBundleDigest: digest('7'),
      workerBundleDigest: digest('8'),
      bindingManifestDigest: digest('9'),
      modelId: '@cf/baai/bge-base-en-v1.5',
      pooling: 'cls',
      tokenizerRevision: 'tokenizer-v1',
      documentBuilderRevision: 'document-v1',
      rankingRevision: 'rrf-v1',
      thresholdRevision: 'cosine-v1',
      providerContractDigest: digest('a'),
      environment: 'test',
      loadProtocolDigest: digest('b'),
      rateCardId: ids[1]!,
      implementationAuthorIds: [ids[2]!],
      fixtureAuthorIds: [ids[3]!],
      judgementAuthorIds: [ids[4]!],
      domainReviewerIds: [ids[5]!, ids[6]!],
      adjudicatorIds: [ids[7]!],
      runnerId: ids[0]!,
      developmentQueryCount: 180,
      queryEvidence: [{ queryKeyDigest: digest('c') }]
    }, { queryOne: queryOne as never })).resolves.toMatchObject({
      id: '10000000-0000-4000-8000-000000000010',
      gatePassed: false
    })

    const [statement, parameters] = queryOne.mock.calls[0] as [string, unknown[]]
    expect(statement).toContain('crm_search_record_evaluation_run')
    expect(parameters).toHaveLength(32)
    expect(JSON.stringify({ statement, parameters })).not.toMatch(/gatePassed|metricBundle/i)
    const [readStatement, readParameters] = queryOne.mock.calls[1] as [string, unknown[]]
    expect(readStatement).toMatch(/organisation_scope_id\s*=\s*\$2/)
    expect(readParameters).toEqual(['10000000-0000-4000-8000-000000000010', ids[0]])
  })

  it('fails closed when an unsealed artifact does not match its checked-in digest', async () => {
    const provider = {
      unseal: vi.fn(async () => ({ sealedJudgementSha256: digest('e'), queries: [] }))
    }

    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1',
      expectedSealedJudgementSha256: digest('d')
    }, provider)).rejects.toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })
  })
})
