import { describe, expect, it } from 'vitest'
import {
  CatalogGovernanceError,
  transitionCatalogRelease,
  type CatalogEvaluationEvidence,
  type CatalogReleaseAudit,
  type CatalogReleaseRecord,
  type CatalogReleaseRepository,
  type CatalogReleaseTransaction
} from '~~/server/utils/ai/governance/catalogReleaseGovernance'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const ENTITY_ID = '20000000-0000-4000-8000-000000000001'
const VERSION_ID = '30000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '40000000-0000-4000-8000-000000000001'
const EVALUATION_RUN_ID = '50000000-0000-4000-8000-000000000001'
const ACTOR_ID = '60000000-0000-4000-8000-000000000001'
const UPDATED_AT = '2026-07-21T08:00:00.000Z'

function release(overrides: Partial<CatalogReleaseRecord> = {}): CatalogReleaseRecord {
  return {
    id: RELEASE_ID,
    kind: 'capability',
    entityId: ENTITY_ID,
    versionId: VERSION_ID,
    departmentId: DEPARTMENT_ID,
    state: 'draft',
    rolloutScope: 'department',
    evaluationRunId: null,
    evaluationGatePassed: null,
    evaluationRunStatus: null,
    changeReason: 'Initial draft',
    changedBy: ACTOR_ID,
    updatedAt: UPDATED_AT,
    ...overrides
  }
}

function evidence(overrides: Partial<CatalogEvaluationEvidence> = {}): CatalogEvaluationEvidence {
  return {
    id: EVALUATION_RUN_ID,
    departmentId: DEPARTMENT_ID,
    packVersionId: null,
    capabilityVersionId: VERSION_ID,
    status: 'completed',
    gatePassed: true,
    ...overrides
  }
}

class FakeRepository implements CatalogReleaseRepository, CatalogReleaseTransaction {
  currentRelease: CatalogReleaseRecord | null
  currentEvidence: CatalogEvaluationEvidence | null
  audits: CatalogReleaseAudit[] = []
  updateCount = 0

  constructor(
    currentRelease: CatalogReleaseRecord | null = release(),
    currentEvidence: CatalogEvaluationEvidence | null = evidence()
  ) {
    this.currentRelease = currentRelease
    this.currentEvidence = currentEvidence
  }

  async transaction<T>(callback: (transaction: CatalogReleaseTransaction) => Promise<T>): Promise<T> {
    return callback(this)
  }

  async lockRelease(kind: CatalogReleaseRecord['kind'], id: string) {
    if (this.currentRelease?.kind !== kind || this.currentRelease.id !== id) return null
    return { ...this.currentRelease }
  }

  async getEvaluationEvidence(id: string) {
    if (this.currentEvidence?.id !== id) return null
    return { ...this.currentEvidence }
  }

  async updateRelease(next: CatalogReleaseRecord) {
    this.updateCount += 1
    this.currentRelease = { ...next }
    return { ...next }
  }

  async appendAudit(event: CatalogReleaseAudit) {
    this.audits.push(structuredClone(event))
  }
}

function request(overrides: Partial<Parameters<typeof transitionCatalogRelease>[0]> = {}) {
  return {
    kind: 'capability' as const,
    releaseId: RELEASE_ID,
    targetState: 'active' as const,
    evaluationRunId: EVALUATION_RUN_ID,
    expectedUpdatedAt: UPDATED_AT,
    reason: 'Approved after the exact deterministic evaluation passed.',
    actorUserId: ACTOR_ID,
    ...overrides
  }
}

describe('transitionCatalogRelease', () => {
  it('promotes an exact evaluated version and appends the audit atomically', async () => {
    const repository = new FakeRepository(release({ state: 'pilot' }))

    const result = await transitionCatalogRelease(request(), repository)

    expect(result.state).toBe('active')
    expect(result.rolloutScope).toBe('department')
    expect(result.evaluationRunId).toBe(EVALUATION_RUN_ID)
    expect(result.evaluationGatePassed).toBe(true)
    expect(result.evaluationRunStatus).toBe('completed')
    expect(result.changedBy).toBe(ACTOR_ID)
    expect(repository.updateCount).toBe(1)
    expect(repository.audits).toEqual([expect.objectContaining({
      departmentId: DEPARTMENT_ID,
      entityType: 'capability',
      entityId: ENTITY_ID,
      action: 'activated',
      previousVersionId: VERSION_ID,
      nextVersionId: VERSION_ID,
      evaluationRunId: EVALUATION_RUN_ID,
      actorUserId: ACTOR_ID,
      reason: request().reason,
      details: {
        releaseId: RELEASE_ID,
        previousReleaseState: 'pilot',
        nextReleaseState: 'active',
        previousRolloutScope: 'department',
        nextRolloutScope: 'department'
      }
    })])
  })

  it('rejects promotion without explicit evaluation evidence', async () => {
    const repository = new FakeRepository()

    await expect(transitionCatalogRelease(request({ evaluationRunId: null }), repository))
      .rejects.toMatchObject({ code: 'evaluation_required', statusCode: 422 })
    expect(repository.updateCount).toBe(0)
    expect(repository.audits).toEqual([])
  })

  it('sets pilot scope only after the exact evaluation passes', async () => {
    const repository = new FakeRepository()

    await expect(transitionCatalogRelease(request({ targetState: 'pilot' }), repository))
      .resolves.toMatchObject({ state: 'pilot', rolloutScope: 'pilot' })
    expect(repository.audits[0]?.details).toMatchObject({
      previousRolloutScope: 'department',
      nextRolloutScope: 'pilot'
    })
  })

  it.each([
    ['failed status', evidence({ status: 'failed', gatePassed: null })],
    ['failed gate', evidence({ gatePassed: false })],
    ['other department', evidence({ departmentId: '40000000-0000-4000-8000-000000000099' })],
    ['other version', evidence({ capabilityVersionId: '30000000-0000-4000-8000-000000000099' })],
    ['other kind', evidence({ packVersionId: VERSION_ID, capabilityVersionId: null })]
  ])('rejects stale or mismatched evidence: %s', async (_label, mismatchedEvidence) => {
    const repository = new FakeRepository(release({ state: 'pilot' }), mismatchedEvidence)

    await expect(transitionCatalogRelease(request(), repository))
      .rejects.toMatchObject({ code: 'evaluation_not_eligible', statusCode: 422 })
    expect(repository.updateCount).toBe(0)
  })

  it('accepts evidence that is jointly bound to the exact pack and capability versions', async () => {
    const repository = new FakeRepository(
      release({ state: 'pilot' }),
      evidence({ packVersionId: '70000000-0000-4000-8000-000000000001' })
    )

    await expect(transitionCatalogRelease(request(), repository)).resolves.toMatchObject({
      state: 'active',
      evaluationRunId: EVALUATION_RUN_ID
    })
  })

  it('rejects an optimistic-concurrency mismatch before updating', async () => {
    const repository = new FakeRepository(release({
      state: 'pilot',
      updatedAt: '2026-07-21T08:05:00.000Z'
    }))

    await expect(transitionCatalogRelease(request(), repository))
      .rejects.toMatchObject({ code: 'release_version_conflict', statusCode: 409 })
    expect(repository.updateCount).toBe(0)
    expect(repository.audits).toEqual([])
  })

  it.each([
    ['draft', 'suspended'],
    ['active', 'pilot'],
    ['retired', 'active'],
    ['retired', 'suspended']
  ] as const)('rejects an invalid %s -> %s transition', async (state, targetState) => {
    const repository = new FakeRepository(release({ state }))

    await expect(transitionCatalogRelease(request({ targetState }), repository))
      .rejects.toMatchObject({ code: 'invalid_release_transition', statusCode: 409 })
    expect(repository.updateCount).toBe(0)
  })

  it('suspends immediately while preserving the prior evaluation evidence', async () => {
    const repository = new FakeRepository(release({
      state: 'active',
      evaluationRunId: EVALUATION_RUN_ID,
      evaluationGatePassed: true,
      evaluationRunStatus: 'completed'
    }))

    const result = await transitionCatalogRelease(request({
      targetState: 'suspended',
      evaluationRunId: null,
      reason: 'Kill switch used while a scope regression is investigated.'
    }), repository)

    expect(result).toMatchObject({
      state: 'suspended',
      rolloutScope: 'department',
      evaluationRunId: EVALUATION_RUN_ID,
      evaluationGatePassed: true,
      evaluationRunStatus: 'completed'
    })
    expect(repository.audits[0]).toMatchObject({
      action: 'suspended',
      evaluationRunId: EVALUATION_RUN_ID,
      details: {
        releaseId: RELEASE_ID,
        previousReleaseState: 'active',
        nextReleaseState: 'suspended',
        previousRolloutScope: 'department',
        nextRolloutScope: 'department'
      }
    })
  })

  it('fails closed for missing releases and invalid reasons', async () => {
    await expect(transitionCatalogRelease(request(), new FakeRepository(null)))
      .rejects.toMatchObject({ code: 'release_not_found', statusCode: 404 })

    await expect(transitionCatalogRelease(request({ reason: '   ' }), new FakeRepository()))
      .rejects.toBeInstanceOf(CatalogGovernanceError)
    await expect(transitionCatalogRelease(request({ reason: 'x'.repeat(2001) }), new FakeRepository()))
      .rejects.toMatchObject({ code: 'invalid_reason', statusCode: 422 })
  })

  it('maps the one-active-version database invariant to a stable conflict', async () => {
    const repository: CatalogReleaseRepository = {
      transaction: async () => {
        throw {
          code: '23505',
          constraint: 'idx_ai_capability_releases_one_active',
          detail: 'sensitive database detail'
        }
      }
    }

    await expect(transitionCatalogRelease(request(), repository)).rejects.toMatchObject({
      code: 'active_release_conflict',
      statusCode: 409,
      message: 'Another version of this catalog entity is already active'
    })
  })
})
