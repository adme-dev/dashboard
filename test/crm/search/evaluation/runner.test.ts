import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { recordCrmSearchEvaluationRun } from '~~/server/utils/crm/search/evaluation/repository'
import {
  resolveCrmSearchEvaluationRuntimeServices,
  runCrmSearchEvaluation
} from '~~/server/utils/crm/search/evaluation/runner'
import {
  resolveCrmSearchSealedArtifactProvider,
  unsealCrmSearchHoldout
} from '~~/server/utils/crm/search/evaluation/sealedArtifact'

const digest = (character: string) => character.repeat(64)
const sealedTestKeyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const sealedTestKeyBase64 = Buffer.from(sealedTestKeyBytes).toString('base64')

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('Synthetic test input is not JSON-serializable')
  return encoded
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sealedAad(input: {
  version: string
  encryption: string
  compression: string
  keyVersion: string
  judgementSha256: string
  queryCount: number
}): Uint8Array {
  return new TextEncoder().encode(canonicalJson(input))
}

async function buildSyntheticSealedArtifact(payload: Record<string, unknown>, options: {
  keyBytes?: Uint8Array
  keyVersion?: string
  nonce?: Uint8Array
  plaintextText?: string
} = {}) {
  const keyBytes = options.keyBytes ?? sealedTestKeyBytes
  const keyVersion = options.keyVersion ?? 'sealed-test-k1'
  const nonce = options.nonce ?? Uint8Array.from({ length: 12 }, (_, index) => index + 101)
  const plaintext = new TextEncoder().encode(options.plaintextText ?? canonicalJson(payload))
  const plaintextSha256 = sha256(plaintext)
  const header = {
    version: 'crm-search-sealed-holdout-envelope-v1',
    encryption: 'AES-256-GCM',
    compression: 'none',
    keyVersion,
    judgementSha256: plaintextSha256,
    queryCount: Array.isArray(payload.queries) ? payload.queries.length : 0
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: nonce, additionalData: sealedAad(header), tagLength: 128
  }, key, plaintext))
  const ciphertext = encryptedWithTag.slice(0, -16)
  const authenticationTag = encryptedWithTag.slice(-16)
  const envelopeText = canonicalJson({
    ...header,
    nonceBase64: Buffer.from(nonce).toString('base64'),
    ciphertextBase64: Buffer.from(ciphertext).toString('base64'),
    authenticationTagBase64: Buffer.from(authenticationTag).toString('base64')
  })
  const bytes = new TextEncoder().encode(envelopeText)
  const contract = {
    version: 'crm-search-sealed-holdout-import-v1',
    objectKey: 'crm-search/evaluation/holdouts/holdout-v1.json',
    contentSha256: sha256(bytes),
    envelopeVersion: header.version,
    encryption: header.encryption,
    compression: header.compression,
    keyVersion,
    judgementSha256: plaintextSha256,
    queryCount: header.queryCount,
    productionReady: true
  }
  return {
    bytes,
    contract,
    provider: {
      contract,
      readBytes: vi.fn(async () => bytes),
      readKey: vi.fn(async ({ keyVersion: requested }: { keyVersion: string }) => {
        if (requested !== keyVersion) throw new Error('wrong key')
        return keyBytes
      })
    },
    plaintextSha256
  }
}

function buildSyntheticHoldout(queryCount = 360): Record<string, unknown> {
  const entityTypes = ['person', 'company', 'opportunity'] as const
  return {
    version: 'crm-search-sealed-holdout-v1',
    queries: Array.from({ length: queryCount }, (_, index) => ({
      clientKeyDigest: sha256(`client-${index % 3}`),
      entityType: entityTypes[index % entityTypes.length],
      judgements: [{ entityKeyDigest: sha256(`entity-${index}`), relevance: index % 4 }],
      queryKeyDigest: sha256(`query-${index}`),
      strata: [index % 2 === 0 ? 'natural_language' : 'exact_name_or_identifier']
    }))
  }
}

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

  it.each(['implementer-1', 'fixture-author-1'])(
    'rejects runner %s when they authored implementation or fixtures',
    async (requestedBy) => {
      const unsealHoldout = vi.fn()
      await expect(runCrmSearchEvaluation({
        fixtureVersion: 'crm-search-evaluation-v1',
        sealedArtifactId: 'artifact-1',
        implementationGitSha: 'c'.repeat(40),
        schemaVersion: 'crm-search-v1',
        requestedBy
      }, {
        loadCheckedInFixtures: vi.fn(async () => ({
          developmentQueryCount: 180,
          adjudicationManifest: {
            implementationAuthorIds: ['implementer-1'],
            fixtureAuthorIds: ['fixture-author-1']
          }
        })),
        freezePreregistration: vi.fn(async () => ({ sha256: digest('a'), frozenAt: '2026-08-10T00:00:00.000Z' })),
        unsealHoldout,
        executeGranularQueries: vi.fn(),
        recordEvaluationRun: vi.fn()
      } as never)).rejects.toThrow(/actor separation/i)

      expect(unsealHoldout).not.toHaveBeenCalled()
    }
  )
})

describe('CRM search governed evidence adapters', () => {
  it('resolves only exact Cloudflare evaluation, sealed R2, and dedicated keyring bindings', async () => {
    const evaluationFetch = vi.fn()
    const get = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }))
    const event = { context: { cloudflare: { env: {
      CRM_SEARCH_EVALUATION_CONFIG: JSON.stringify({
        organisationScopeId: '10000000-0000-4000-8000-000000000001',
        deploymentBinding: {
          implementationGitSha: '1'.repeat(40),
          artifactManifestDigest: digest('2'),
          pagesBundleDigest: digest('3'),
          workerBundleDigest: digest('4'),
          bindingManifestDigest: digest('5'),
          schemaVersion: 'crm-search-v1',
          modelId: '@cf/baai/bge-base-en-v1.5',
          tokenizerRevision: 'tokenizer-v1',
          documentBuilderRevision: 'document-v1',
          rankingRevision: 'rrf-v1',
          thresholdRevision: 'cosine-v1',
          providerContractDigest: digest('6'),
          environment: 'preview',
          loadProtocolDigest: digest('7'),
          rateCardId: '10000000-0000-4000-8000-000000000002'
        }
      }),
      CRM_SEARCH_EVALUATION_RUNNER: { fetch: evaluationFetch },
      CRM_SEARCH_SEALED_HOLDOUTS: { get },
      CRM_SEARCH_SEALED_HOLDOUT_KEYRING: JSON.stringify({
        version: 'crm-search-sealed-holdout-keyring-v1',
        activeVersion: 'sealed-test-k1',
        keys: { 'sealed-test-k1': sealedTestKeyBase64 }
      })
    } } } } as never

    expect(resolveCrmSearchEvaluationRuntimeServices(event)).toMatchObject({
      organisationScopeId: '10000000-0000-4000-8000-000000000001',
      checkedInFixtures: { schemaVersion: 'crm-search-evaluation-v1' }
    })
    const artifact = await buildSyntheticSealedArtifact(buildSyntheticHoldout())
    const provider = resolveCrmSearchSealedArtifactProvider(event, artifact.contract)
    await provider.readBytes({ artifactId: 'holdout-v1' })
    expect(get).toHaveBeenCalledWith('crm-search/evaluation/holdouts/holdout-v1.json')
    await expect(provider.readKey({ keyVersion: 'sealed-test-k1' })).resolves.toEqual(sealedTestKeyBytes)
    expect(() => resolveCrmSearchEvaluationRuntimeServices({ context: {} } as never)).toThrow()
    expect(() => resolveCrmSearchSealedArtifactProvider({ context: {} } as never)).toThrow()
    expect(() => resolveCrmSearchSealedArtifactProvider({ context: { cloudflare: { env: {
      CRM_SEARCH_SEALED_HOLDOUTS: { get },
      CRM_SEARCH_CONFIRMATION_KEYRING: JSON.stringify({
        version: 'crm-search-sealed-holdout-keyring-v1',
        activeVersion: 'sealed-test-k1', keys: { 'sealed-test-k1': sealedTestKeyBase64 }
      })
    } } } } as never, artifact.contract)).toThrow()

    const malformed = { context: { cloudflare: { env: {
      CRM_SEARCH_EVALUATION_RUNNER: { fetch: evaluationFetch },
      CRM_SEARCH_EVALUATION_CONFIG: JSON.stringify({
        organisationScopeId: 'not-a-uuid', deploymentBinding: {}
      })
    } } } }
    expect(() => resolveCrmSearchEvaluationRuntimeServices(malformed as never)).toThrow()
  })

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
      reason: 'Execute independently reviewed sealed evaluation run.',
      queryEvidence: [{ queryKeyDigest: digest('c') }]
    }, { queryOne: queryOne as never })).resolves.toMatchObject({
      id: '10000000-0000-4000-8000-000000000010',
      gatePassed: false
    })

    const [statement, parameters] = queryOne.mock.calls[0] as [string, unknown[]]
    expect(statement).toContain('crm_search_record_evaluation_run')
    expect(parameters).toHaveLength(33)
    expect(parameters[31]).toBe('Execute independently reviewed sealed evaluation run.')
    expect(JSON.stringify({ statement, parameters })).not.toMatch(/gatePassed|metricBundle/i)
    const [readStatement, readParameters] = queryOne.mock.calls[1] as [string, unknown[]]
    expect(readStatement).toMatch(/organisation_scope_id\s*=\s*\$2/)
    expect(readParameters).toEqual(['10000000-0000-4000-8000-000000000010', ids[0]])
  })

  it('fails closed when an encrypted envelope does not match its pinned object digest', async () => {
    const artifact = await buildSyntheticSealedArtifact(buildSyntheticHoldout())
    const provider = {
      ...artifact.provider,
      contract: { ...artifact.contract, contentSha256: digest('d') }
    }

    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1',
      expectedSealedJudgementSha256: artifact.plaintextSha256
    }, provider)).rejects.toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })
  })

  it('authenticates and decrypts an exact canonical 360-query envelope with no compression', async () => {
    const holdout = buildSyntheticHoldout()
    const artifact = await buildSyntheticSealedArtifact(holdout)

    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1',
      expectedSealedJudgementSha256: artifact.plaintextSha256
    }, artifact.provider)).resolves.toMatchObject({
      sealedJudgementSha256: artifact.plaintextSha256,
      version: 'crm-search-sealed-holdout-v1',
      queries: expect.arrayContaining([expect.objectContaining({ queryKeyDigest: expect.any(String) })])
    })
    const result = await unsealCrmSearchHoldout({
      artifactId: 'holdout-v1', expectedSealedJudgementSha256: artifact.plaintextSha256
    }, artifact.provider)
    expect(result.queries).toHaveLength(360)
  })

  it('fails closed on the wrong key, header version, auth tag, or compressed envelope', async () => {
    const artifact = await buildSyntheticSealedArtifact(buildSyntheticHoldout())
    const parsed = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<string, unknown>
    const cases = [
      { ...artifact.provider, readKey: vi.fn(async () => Uint8Array.from({ length: 32 }, () => 9)) },
      { ...artifact.provider, contract: { ...artifact.contract, keyVersion: 'sealed-test-k2' } },
      { ...artifact.provider, contract: { ...artifact.contract, envelopeVersion: 'crm-search-sealed-holdout-envelope-v2' } },
      { ...artifact.provider, contract: { ...artifact.contract, compression: 'gzip' } },
      {
        ...artifact.provider,
        readBytes: vi.fn(async () => new TextEncoder().encode(canonicalJson({
          ...parsed, authenticationTagBase64: Buffer.from(new Uint8Array(16)).toString('base64')
        }))),
        contract: {
          ...artifact.contract,
          contentSha256: sha256(new TextEncoder().encode(canonicalJson({
            ...parsed, authenticationTagBase64: Buffer.from(new Uint8Array(16)).toString('base64')
          })))
        }
      }
    ]
    for (const provider of cases) {
      await expect(unsealCrmSearchHoldout({
        artifactId: 'holdout-v1', expectedSealedJudgementSha256: artifact.plaintextSha256
      }, provider)).rejects.toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })
    }
  })

  it('recursively rejects sensitive content and non-canonical decrypted payloads', async () => {
    const sensitive = buildSyntheticHoldout()
    const first = (sensitive.queries as Array<Record<string, unknown>>)[0]!
    first.arbitrary = { nested: ['safe', { value: 'alex@example.invalid' }] }
    const sensitiveArtifact = await buildSyntheticSealedArtifact(sensitive)
    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1',
      expectedSealedJudgementSha256: sensitiveArtifact.plaintextSha256
    }, sensitiveArtifact.provider)).rejects
      .toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })

    const shortArtifact = await buildSyntheticSealedArtifact(buildSyntheticHoldout(359))
    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1', expectedSealedJudgementSha256: shortArtifact.plaintextSha256
    }, shortArtifact.provider)).rejects.toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })

    const canonicalPayload = buildSyntheticHoldout()
    const nonCanonicalArtifact = await buildSyntheticSealedArtifact(canonicalPayload, {
      plaintextText: JSON.stringify(canonicalPayload, null, 2)
    })
    await expect(unsealCrmSearchHoldout({
      artifactId: 'holdout-v1', expectedSealedJudgementSha256: nonCanonicalArtifact.plaintextSha256
    }, nonCanonicalArtifact.provider)).rejects
      .toMatchObject({ code: 'crm_search_sealed_artifact_unavailable' })
  })
})
