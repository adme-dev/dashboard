import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { reconcileVideoGenerationLiabilityIn } from '../../server/utils/video-generation/liabilityReconciliation'
import type { ReconcileVideoGenerationLiabilityInput } from '../../server/utils/video-generation/liabilityReconciliation'
import { TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL } from '../../shared/video/generationLiability'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
if (connectionString) {
  const url = new URL(connectionString)
  const isolatedLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && url.pathname === '/video_storyboard_recovery_test' && Boolean(url.port) && !url.search
  if (!isolatedLocal) throw new Error('STORYBOARD_TEST_DATABASE_URL must be the isolated localhost video_storyboard_recovery_test database')
}
const pool = connectionString ? new Pool({ connectionString, max: 4 }) : null

afterAll(async () => {
  await pool?.end()
})

/** Legacy-shaped terminal row (no fingerprint), exactly like 506's historical backfill. */
async function legacyTerminalJob(status: 'succeeded' | 'failed' | 'blocked' | 'running', estimate = 150) {
  const ids = { tenantId: randomUUID(), projectId: randomUUID(), jobId: randomUUID() }
  await pool!.query(
    `INSERT INTO video_generation_jobs (id, tenant_id, project_id, created_by, status, mode, model_id, provider, prompt,
       source_asset_ids, duration_seconds, aspect_ratio, subject_type, compliance_status, compliance_reasons,
       estimated_cost_cents, idempotency_key)
     VALUES ($1,$2,$3,$4,'queued','image-to-video','aigateway/seedance-i2v','aigateway','reconciliation fixture','{}',5,'16:9','vehicle','vehicle_i2v','{}',$5,$6)`,
    [ids.jobId, ids.tenantId, ids.projectId, randomUUID(), estimate, randomUUID()]
  )
  // Historical shape: claimed before migration, liability uncertain, then terminal without cost.
  await pool!.query(`UPDATE video_generation_jobs SET liability_state='uncertain', liability_cents=$2, submission_attempted_at=now(), status=$3 WHERE id=$1`, [ids.jobId, estimate, status])
  return ids
}

async function owner() {
  const id = randomUUID()
  await pool!.query(`INSERT INTO team_members (id, is_active, user_role) VALUES ($1, TRUE, 'owner')`, [id])
  return id
}

function input(ids: { tenantId: string, projectId: string, jobId: string }, actorId: string, overrides: Partial<ReconcileVideoGenerationLiabilityInput> = {}): ReconcileVideoGenerationLiabilityInput {
  return {
    operationId: `reconcile:${randomUUID()}`,
    jobId: ids.jobId,
    tenantId: ids.tenantId,
    projectId: ids.projectId,
    expectedLiabilityCents: 150,
    outcome: 'reported',
    actualCostCents: 120,
    evidenceKind: 'provider_log',
    evidenceReference: 'aig-log-0001-synthetic',
    actorId,
    ...overrides
  }
}

async function run(value: ReconcileVideoGenerationLiabilityInput, apply = true) {
  const client = await pool!.connect()
  try {
    await client.query('BEGIN')
    const result = await reconcileVideoGenerationLiabilityIn(client, value, { apply })
    await client.query(apply && result.ok ? 'COMMIT' : 'ROLLBACK')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function job(id: string) {
  return (await pool!.query('SELECT status, liability_state, liability_cents, actual_cost_cents FROM video_generation_jobs WHERE id=$1', [id])).rows[0]
}
async function tenantSum(tenantId: string) {
  return Number((await pool!.query(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL, [tenantId])).rows[0].total)
}

describe.skipIf(!pool)('video generation liability reconciliation on localhost', () => {
  it('reports a provider-proven cost once, with immutable evidence, and the cap sum follows', async () => {
    const ids = await legacyTerminalJob('succeeded')
    const actor = await owner()
    expect(await tenantSum(ids.tenantId)).toBe(150)

    const dry = await run(input(ids, actor), false)
    expect(dry).toMatchObject({ ok: true, liabilityState: 'reported', liabilityCents: 120 })
    expect(await job(ids.jobId)).toMatchObject({ liability_state: 'uncertain', liability_cents: 150, actual_cost_cents: null })

    const value = input(ids, actor)
    const applied = await run(value)
    expect(applied).toMatchObject({ ok: true, replayed: false, liabilityState: 'reported', liabilityCents: 120 })
    expect(await job(ids.jobId)).toMatchObject({ status: 'succeeded', liability_state: 'reported', liability_cents: 120, actual_cost_cents: 120 })

    const replay = await run(value)
    expect(replay).toMatchObject({ ok: true, replayed: true, liabilityCents: 120 })
    expect(await run({ ...value, actualCostCents: 0 })).toEqual({ ok: false, reason: 'operation_conflict' })
    expect(await run(input(ids, actor))).toEqual({ ok: false, reason: 'already_reconciled' })

    await expect(pool!.query('UPDATE video_generation_liability_reconciliations SET note=$2 WHERE job_id=$1', [ids.jobId, 'edit'])).rejects.toThrow('immutable')
    await expect(pool!.query('DELETE FROM video_generation_liability_reconciliations WHERE job_id=$1', [ids.jobId])).rejects.toThrow('immutable')
    expect((await pool!.query('SELECT count(*)::int AS n FROM video_generation_liability_reconciliations WHERE job_id=$1', [ids.jobId])).rows[0].n).toBe(1)
  })

  it('releases only with a provider-proof reference and removes it from the tenant cap', async () => {
    const ids = await legacyTerminalJob('failed')
    const actor = await owner()
    const released = await run(input(ids, actor, { outcome: 'released', actualCostCents: null, evidenceKind: 'provider_invoice', evidenceReference: 'invoice-2026-06-line-17' }))
    expect(released).toMatchObject({ ok: true, liabilityState: 'released', liabilityCents: 0 })
    expect(await job(ids.jobId)).toMatchObject({ status: 'failed', liability_state: 'released', liability_cents: 0, actual_cost_cents: null })
    expect(await tenantSum(ids.tenantId)).toBe(0)
  })

  it('rejects stale expectations, wrong scope, non-owners, live jobs and missing proof without writing', async () => {
    const ids = await legacyTerminalJob('failed')
    const actor = await owner()
    const admin = randomUUID()
    await pool!.query(`INSERT INTO team_members (id, is_active, user_role) VALUES ($1, TRUE, 'admin')`, [admin])
    const inactiveOwner = randomUUID()
    await pool!.query(`INSERT INTO team_members (id, is_active, user_role) VALUES ($1, FALSE, 'owner')`, [inactiveOwner])

    expect(await run(input(ids, actor, { expectedLiabilityCents: 149 }))).toEqual({ ok: false, reason: 'liability_changed' })
    expect(await run(input(ids, actor, { tenantId: 'another-tenant' }))).toEqual({ ok: false, reason: 'scope_mismatch' })
    expect(await run(input(ids, actor, { projectId: randomUUID() }))).toEqual({ ok: false, reason: 'scope_mismatch' })
    expect(await run(input(ids, admin))).toEqual({ ok: false, reason: 'actor_not_owner' })
    expect(await run(input(ids, inactiveOwner))).toEqual({ ok: false, reason: 'actor_not_owner' })
    expect(await run(input({ ...ids, jobId: randomUUID() }, actor))).toEqual({ ok: false, reason: 'job_not_found' })
    expect(await run(input(ids, actor, { evidenceReference: 'short' }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { outcome: 'reported', actualCostCents: null }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { outcome: 'released', actualCostCents: 0 }))).toMatchObject({ ok: false, reason: 'invalid_input' })

    const live = await legacyTerminalJob('running')
    expect(await run(input(live, actor))).toEqual({ ok: false, reason: 'job_not_terminal' })

    expect(await job(ids.jobId)).toMatchObject({ liability_state: 'uncertain', liability_cents: 150 })
    expect((await pool!.query('SELECT count(*)::int AS n FROM video_generation_liability_reconciliations WHERE job_id IN ($1,$2)', [ids.jobId, live.jobId])).rows[0].n).toBe(0)
  })

  it('lets exactly one of two concurrent reconciliations of the same job win', async () => {
    const ids = await legacyTerminalJob('failed')
    const actor = await owner()
    const results = await Promise.all([
      run(input(ids, actor, { actualCostCents: 100 })),
      run(input(ids, actor, { outcome: 'released', actualCostCents: null, evidenceReference: 'aig-log-0002-synthetic' }))
    ])
    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok).map(r => (r as { reason: string }).reason)).toEqual(['already_reconciled'])
    expect((await pool!.query('SELECT count(*)::int AS n FROM video_generation_liability_reconciliations WHERE job_id=$1', [ids.jobId])).rows[0].n).toBe(1)
    const after = await job(ids.jobId)
    expect(['reported', 'released']).toContain(after.liability_state)
  })
})
