import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { reconcileVideoGenerationLiabilityIn } from '../../server/utils/video-generation/liabilityReconciliation'
import type { ReconcileVideoGenerationLiabilityInput } from '../../server/utils/video-generation/liabilityReconciliation'
import { CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, MARK_VIDEO_GENERATION_FAILED_SQL, TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL } from '../../shared/video/generationLiability'

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
    evidenceSha256: 'a'.repeat(64),
    validationMethod: 'provider_console_lookup',
    providerIdentity: 'operator-supplied-provider-id',
    currency: 'USD',
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
  it('reports an operator-attested cost once, with immutable evidence, and the cap sum follows', async () => {
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

  it('releases only with a provider-evidence reference and removes it from the tenant cap', async () => {
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
    expect(await run(input(ids, actor, { evidenceReference: '        ' }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { evidenceSha256: '' }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { currency: 'EUR' as 'USD' }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { validationMethod: 'guess' as never }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { providerIdentity: '' }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { actualCostCents: 2_147_483_648 }))).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(await run(input(ids, actor, { expectedLiabilityCents: Number.MAX_SAFE_INTEGER }))).toMatchObject({ ok: false, reason: 'invalid_input' })
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

  it('canonicalizes replays, treats a changed note as a conflict, and records the executing role', async () => {
    const ids = await legacyTerminalJob('failed')
    const actor = await owner()
    const value = input(ids, actor, { note: 'reviewed export' })
    expect(await run(value)).toMatchObject({ ok: true, replayed: false })
    expect(await run({ ...value, evidenceReference: `  ${value.evidenceReference}  `, operationId: ` ${value.operationId} `, evidenceSha256: 'A'.repeat(64) })).toMatchObject({ ok: true, replayed: true })
    expect(await run({ ...value, note: 'different note' })).toEqual({ ok: false, reason: 'operation_conflict' })
    const row = (await pool!.query('SELECT executed_by_role, evidence_sha256 FROM video_generation_liability_reconciliations WHERE job_id=$1', [ids.jobId])).rows[0]
    expect(row.executed_by_role).toBe((await pool!.query('SELECT current_user AS u')).rows[0].u)
    expect(row.evidence_sha256).toBe('a'.repeat(64))
    await expect(pool!.query('TRUNCATE video_generation_liability_reconciliations')).rejects.toThrow('immutable')
  })

  it('serializes one operation id used for two different jobs concurrently', async () => {
    const first = await legacyTerminalJob('failed')
    const second = await legacyTerminalJob('failed')
    const actor = await owner()
    const operationId = `reconcile:${randomUUID()}`
    const results = await Promise.all([
      run(input(first, actor, { operationId })),
      run(input(second, actor, { operationId }))
    ])
    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok)).toEqual([{ ok: false, reason: 'operation_conflict' }])
    const states = [await job(first.jobId), await job(second.jobId)].map(r => r.liability_state).sort()
    expect(states).toEqual(['reported', 'uncertain'])
  })

  it('settles a claimed new-style (fingerprinted) failed job without touching status or output pointers', async () => {
    const ids = { tenantId: randomUUID(), projectId: randomUUID(), jobId: randomUUID() }
    await pool!.query(
      `INSERT INTO video_generation_jobs (id, tenant_id, project_id, created_by, status, mode, model_id, provider, prompt,
         source_asset_ids, duration_seconds, aspect_ratio, subject_type, compliance_status, compliance_reasons,
         estimated_cost_cents, idempotency_key, request_fingerprint, liability_state, liability_cents, dispatch_eligible)
       VALUES ($1,$2,$3,$4,'queued','image-to-video','aigateway/seedance-i2v','aigateway','fingerprinted fixture','{}',5,'16:9','vehicle','vehicle_i2v','{}',90,$5,$6,'reserved',90,true)`,
      [ids.jobId, ids.tenantId, ids.projectId, randomUUID(), randomUUID(), 'f'.repeat(64)]
    )
    expect((await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [ids.jobId])).rowCount).toBe(1)
    await pool!.query(MARK_VIDEO_GENERATION_FAILED_SQL, [ids.jobId, 'provider timeout', false, null])
    const before = (await pool!.query('SELECT status, liability_state, liability_cents, output_asset_id, output_r2_key FROM video_generation_jobs WHERE id=$1', [ids.jobId])).rows[0]
    expect(before).toMatchObject({ status: 'failed', liability_state: 'uncertain', liability_cents: 90 })
    const actor = await owner()
    expect(await run(input(ids, actor, { expectedLiabilityCents: 90, actualCostCents: 75 }))).toMatchObject({ ok: true, liabilityState: 'reported', liabilityCents: 75 })
    const after = (await pool!.query('SELECT status, liability_state, liability_cents, actual_cost_cents, output_asset_id, output_r2_key FROM video_generation_jobs WHERE id=$1', [ids.jobId])).rows[0]
    expect(after).toMatchObject({ status: 'failed', liability_state: 'reported', liability_cents: 75, actual_cost_cents: 75, output_asset_id: before.output_asset_id, output_r2_key: before.output_r2_key })
  })

  it('binds the settlement to the job\'s own provider request id when one exists', async () => {
    const ids = await legacyTerminalJob('succeeded')
    await pool!.query(`UPDATE video_generation_jobs SET provider_request_id = 'aig-req-12345' WHERE id = $1`, [ids.jobId])
    const actor = await owner()
    expect(await run(input(ids, actor, { providerIdentity: 'aig-req-99999' }))).toEqual({ ok: false, reason: 'provider_identity_mismatch' })
    expect(await run(input(ids, actor, { providerIdentity: 'aig-req-12345', validationMethod: 'invoice_line_match' }))).toMatchObject({ ok: true, liabilityState: 'reported' })
    const evidence = (await pool!.query('SELECT provider_request_id_snapshot, provider_identity, currency, validation_method FROM video_generation_liability_reconciliations WHERE job_id = $1', [ids.jobId])).rows[0]
    expect(evidence).toEqual({ provider_request_id_snapshot: 'aig-req-12345', provider_identity: 'aig-req-12345', currency: 'USD', validation_method: 'invoice_line_match' })
  })

  it('records an operator-attested identity when the job never stored a provider request id', async () => {
    const ids = await legacyTerminalJob('failed')
    const actor = await owner()
    expect(await run(input(ids, actor, { providerIdentity: '  padded-legacy-id ' }))).toMatchObject({ ok: true })
    const evidence = (await pool!.query('SELECT provider_identity, provider_identity_source, provider_request_id_snapshot FROM video_generation_liability_reconciliations WHERE job_id = $1', [ids.jobId])).rows[0]
    expect(evidence).toEqual({ provider_identity: '  padded-legacy-id ', provider_identity_source: 'operator_attested', provider_request_id_snapshot: null })
  })

  it('matches short or padded legacy provider request ids exactly and rejects a replay after the id changes', async () => {
    const ids = await legacyTerminalJob('succeeded')
    await pool!.query(`UPDATE video_generation_jobs SET provider_request_id = ' r1 ' WHERE id = $1`, [ids.jobId])
    const actor = await owner()
    expect(await run(input(ids, actor, { providerIdentity: 'r1' }))).toEqual({ ok: false, reason: 'provider_identity_mismatch' })
    const value = input(ids, actor, { providerIdentity: ' r1 ' })
    expect(await run(value)).toMatchObject({ ok: true })
    expect((await pool!.query('SELECT provider_identity_source FROM video_generation_liability_reconciliations WHERE job_id = $1', [ids.jobId])).rows[0].provider_identity_source).toBe('job_provider_request_id')
    await pool!.query(`UPDATE video_generation_jobs SET provider_request_id = 'r2' WHERE id = $1`, [ids.jobId])
    expect(await run(value)).toEqual({ ok: false, reason: 'operation_conflict' })
  })
})
