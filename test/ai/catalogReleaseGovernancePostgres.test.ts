import { describe, expect, it, vi } from 'vitest'
import {
  CatalogGovernanceError,
  createPostgresCatalogReleaseTransaction,
  type CatalogReleaseRecord
} from '~~/server/utils/ai/governance/catalogReleaseGovernance'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const ENTITY_ID = '20000000-0000-4000-8000-000000000001'
const VERSION_ID = '30000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '40000000-0000-4000-8000-000000000001'
const EVALUATION_RUN_ID = '50000000-0000-4000-8000-000000000001'
const ACTOR_ID = '60000000-0000-4000-8000-000000000001'

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RELEASE_ID,
    entity_id: ENTITY_ID,
    version_id: VERSION_ID,
    department_id: DEPARTMENT_ID,
    release_state: 'pilot',
    evaluation_run_id: EVALUATION_RUN_ID,
    evaluation_gate_passed: true,
    evaluation_run_status: 'completed',
    change_reason: 'Pilot approved',
    changed_by: ACTOR_ID,
    updated_at: '2026-07-21T08:00:00.000Z',
    ...overrides
  }
}

function release(): CatalogReleaseRecord {
  return {
    id: RELEASE_ID,
    kind: 'capability',
    entityId: ENTITY_ID,
    versionId: VERSION_ID,
    departmentId: DEPARTMENT_ID,
    state: 'active',
    evaluationRunId: EVALUATION_RUN_ID,
    evaluationGatePassed: true,
    evaluationRunStatus: 'completed',
    changeReason: 'Activation approved',
    changedBy: ACTOR_ID,
    updatedAt: '2026-07-21T08:05:00.000Z'
  }
}

describe('Postgres catalog release transaction adapter', () => {
  it('selects a release from a static kind-specific table and locks it', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [dbRow()] })
    const adapter = createPostgresCatalogReleaseTransaction({ query })

    const result = await adapter.lockRelease('pack', RELEASE_ID)

    expect(result).toMatchObject({
      kind: 'pack',
      entityId: ENTITY_ID,
      versionId: VERSION_ID,
      state: 'pilot'
    })
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FROM ai_pack_releases[\s\S]*FOR UPDATE/), [RELEASE_ID])
    expect(query.mock.calls[0]![0]).toContain('pack_id AS entity_id')
    expect(query.mock.calls[0]![0]).toContain('pack_version_id AS version_id')
  })

  it('preserves joint pack and capability evaluation identities', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: EVALUATION_RUN_ID,
      department_id: DEPARTMENT_ID,
      pack_version_id: '70000000-0000-4000-8000-000000000001',
      capability_version_id: VERSION_ID,
      status: 'completed',
      gate_passed: true
    }] })
    const adapter = createPostgresCatalogReleaseTransaction({ query })

    await expect(adapter.getEvaluationEvidence(EVALUATION_RUN_ID)).resolves.toEqual({
      id: EVALUATION_RUN_ID,
      departmentId: DEPARTMENT_ID,
      packVersionId: '70000000-0000-4000-8000-000000000001',
      capabilityVersionId: VERSION_ID,
      status: 'completed',
      gatePassed: true
    })
  })

  it('updates only governance fields and returns the database timestamp', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [dbRow({
      release_state: 'active',
      change_reason: 'Activation approved',
      updated_at: '2026-07-21T08:05:30.000Z'
    })] })
    const adapter = createPostgresCatalogReleaseTransaction({ query })

    const result = await adapter.updateRelease(release())

    expect(result.updatedAt).toBe('2026-07-21T08:05:30.000Z')
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('UPDATE ai_capability_releases')
    expect(sql).not.toMatch(/\bDELETE\b/i)
    expect(params).toEqual([
      RELEASE_ID,
      'active',
      EVALUATION_RUN_ID,
      true,
      'completed',
      'Activation approved',
      ACTOR_ID
    ])
  })

  it('fails closed if the locked release cannot be returned after update', async () => {
    const adapter = createPostgresCatalogReleaseTransaction({
      query: vi.fn().mockResolvedValue({ rows: [] })
    })

    await expect(adapter.updateRelease(release())).rejects.toEqual(expect.objectContaining({
      code: 'release_update_failed',
      statusCode: 409
    }))
    await expect(adapter.updateRelease(release())).rejects.toBeInstanceOf(CatalogGovernanceError)
  })

  it('appends a bounded audit record with parameterized details', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const adapter = createPostgresCatalogReleaseTransaction({ query })

    await adapter.appendAudit({
      departmentId: DEPARTMENT_ID,
      entityType: 'capability',
      entityId: ENTITY_ID,
      action: 'activated',
      previousVersionId: VERSION_ID,
      nextVersionId: VERSION_ID,
      evaluationRunId: EVALUATION_RUN_ID,
      actorUserId: ACTOR_ID,
      reason: 'Activation approved',
      details: {
        releaseId: RELEASE_ID,
        previousReleaseState: 'pilot',
        nextReleaseState: 'active'
      }
    })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('INSERT INTO ai_catalog_audit_events')
    expect(sql).toContain('$10::jsonb')
    expect(params?.slice(0, 9)).toEqual([
      DEPARTMENT_ID,
      'capability',
      ENTITY_ID,
      'activated',
      VERSION_ID,
      VERSION_ID,
      EVALUATION_RUN_ID,
      ACTOR_ID,
      'Activation approved'
    ])
    expect(JSON.parse(params?.[9] as string)).toEqual({
      releaseId: RELEASE_ID,
      previousReleaseState: 'pilot',
      nextReleaseState: 'active'
    })
  })
})
