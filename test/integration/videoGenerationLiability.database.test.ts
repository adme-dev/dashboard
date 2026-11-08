import { createHash, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { reserveAndCreateVideoGenerationJob } from '~~/server/utils/video-generation/budget'
import {
  CLAIM_VIDEO_GENERATION_SUBMISSION_SQL,
  FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL,
  MARK_VIDEO_GENERATION_FAILED_SQL,
  MARK_VIDEO_GENERATION_RUNNING_SQL,
  MARK_VIDEO_GENERATION_SUCCEEDED_SQL,
  MARK_VIDEO_GENERATION_UNKNOWN_SQL,
  PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL,
  TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL
} from '~~/shared/video/generationLiability'
import { loadVideoGenerationBudgetStatus } from '~~/server/utils/video-generation/budgetStatus'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
if (connectionString) {
  const url = new URL(connectionString)
  const isolatedLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && url.pathname === '/video_storyboard_recovery_test'
    && Boolean(url.port)
    && !url.search
  if (!isolatedLocal) {
    throw new Error('STORYBOARD_TEST_DATABASE_URL must be localhost, 127.0.0.1, or [::1], with an explicit port, pathname /video_storyboard_recovery_test, and no query')
  }
}

const pool = connectionString ? new Pool({ connectionString, max: 4 }) : null
const tenants: string[] = []

vi.mock('~~/server/utils/db', () => ({
  query: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows,
  queryOne: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows[0] ?? null,
  queryOneFresh: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows[0] ?? null,
  queryRows: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows,
  queryRowsFresh: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rows,
  execute: async (sql: string, params?: unknown[]) => (await pool!.query(sql, params)).rowCount ?? 0,
  transaction: async (operation: (db: PoolClient) => Promise<unknown>) => {
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch { /* the original error is the test failure */ }
      throw error
    } finally {
      client.release()
    }
  }
}))

type Reservation = Parameters<typeof reserveAndCreateVideoGenerationJob>[0]
type Policy = NonNullable<Parameters<typeof reserveAndCreateVideoGenerationJob>[1]>

interface Scope {
  tenantId: string
  projectId: string
  userId: string
}

/** Shared success SQL stamps completed_at at now(). Month tests move that accounting instant back one UTC month. */
const PREVIOUS_UTC_MONTH = `((date_trunc('month', (now() AT TIME ZONE 'UTC')) - interval '1 day') AT TIME ZONE 'UTC')`

function outputHash(label: string): string {
  return createHash('sha256').update(label).digest('hex')
}

function scope(): Scope {
  const tenantId = randomUUID()
  tenants.push(tenantId)
  return { tenantId, projectId: randomUUID(), userId: randomUUID() }
}

function reservation(ids: Scope, overrides: Partial<Reservation> = {}): Reservation {
  return {
    tenantId: ids.tenantId,
    projectId: ids.projectId,
    timelineId: null,
    createdBy: ids.userId,
    status: 'queued',
    mode: 'image-to-video',
    modelId: 'aigateway/seedance-i2v',
    provider: 'aigateway',
    prompt: 'liability database fixture',
    sourceAssetIds: [],
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: '720p',
    subjectType: 'vehicle',
    complianceStatus: 'vehicle_i2v',
    complianceReasons: [],
    estimatedCostCents: 60,
    idempotencyKey: randomUUID(),
    id: randomUUID(),
    dispatchEligible: true,
    ...overrides
  } as Reservation
}

const cap: Policy = { enabled: true, monthlyCapCents: 100 }

async function sums(tenantId: string, projectId: string) {
  const tenant = await pool!.query(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL, [tenantId])
  const project = await pool!.query(PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL, [projectId])
  return { tenant: Number(tenant.rows[0].total), project: Number(project.rows[0].total) }
}

async function jobCount(tenantId: string): Promise<number> {
  const result = await pool!.query('SELECT count(*)::int AS count FROM video_generation_jobs WHERE tenant_id = $1', [tenantId])
  return Number(result.rows[0].count)
}

async function job(id: string) {
  const result = await pool!.query('SELECT * FROM video_generation_jobs WHERE id = $1', [id])
  return result.rows[0]
}

async function succeed(id: string, hash: string, actualCostCents: number) {
  await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [id])
  return pool!.query(MARK_VIDEO_GENERATION_SUCCEEDED_SQL, [
    id,
    'ready',
    'memory://canonical-output',
    null,
    null,
    actualCostCents,
    hash
  ])
}

describe.skipIf(!pool)('video generation liability on localhost', () => {
  beforeAll(async () => {
    const current = await pool!.query('SELECT current_database() AS name')
    expect(current.rows[0].name).toBe('video_storyboard_recovery_test')
    const columns = await pool!.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'video_generation_jobs'
          AND column_name = ANY($1::text[])`,
      [['liability_state', 'liability_cents', 'request_fingerprint', 'submission_attempted_at', 'dispatch_eligible', 'output_sha256']]
    )
    expect(columns.rows.map(row => row.column_name).sort()).toEqual([
      'dispatch_eligible',
      'liability_cents',
      'liability_state',
      'output_sha256',
      'request_fingerprint',
      'submission_attempted_at'
    ])
  })

  afterAll(async () => {
    for (const tenantId of tenants) {
      await pool!.query('DELETE FROM video_generation_jobs WHERE tenant_id = $1', [tenantId])
    }
    await pool!.end()
  })

  it('keeps fresh legacy rolling-deployment writes dispatchable once and rejects terminal regression', async () => {
    const ids = scope()
    const original = await reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    const legacyId = randomUUID()
    await pool!.query(`INSERT INTO video_generation_jobs (
      id, tenant_id, project_id, created_by, status, mode, model_id, provider, prompt,
      source_asset_ids, duration_seconds, aspect_ratio, resolution, subject_type,
      compliance_status, compliance_reasons, estimated_cost_cents, idempotency_key
    ) SELECT $1, tenant_id, project_id, created_by, status, mode, model_id, provider, prompt,
      source_asset_ids, duration_seconds, aspect_ratio, resolution, subject_type,
      compliance_status, compliance_reasons, estimated_cost_cents, $2
      FROM video_generation_jobs WHERE id=$3`, [legacyId, randomUUID(), original.job.id])
    expect(await job(legacyId)).toMatchObject({ liability_state: 'reserved', liability_cents: 60, dispatch_eligible: true })
    expect((await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [legacyId])).rowCount).toBe(1)
    expect((await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [legacyId])).rowCount).toBe(0)
    await pool!.query('UPDATE video_generation_jobs SET status=\'running\' WHERE id=$1', [legacyId])
    expect((await sums(ids.tenantId, ids.projectId)).tenant).toBe(120)
    await pool!.query('UPDATE video_generation_jobs SET status=\'succeeded\', actual_cost_cents=85 WHERE id=$1', [legacyId])
    await pool!.query('UPDATE video_generation_jobs SET status=\'failed\', actual_cost_cents=NULL WHERE id=$1', [legacyId])
    expect(await job(legacyId)).toMatchObject({ status: 'succeeded', actual_cost_cents: 85, liability_state: 'reported', liability_cents: 85 })
  })

  it('does not reserve a second charge for the same project operation after a client change', async () => {
    const first = scope()
    const second = { ...scope(), projectId: first.projectId }
    const operation = randomUUID()
    const results = await Promise.all([
      reserveAndCreateVideoGenerationJob(reservation(first, { idempotencyKey: operation }), cap),
      reserveAndCreateVideoGenerationJob(reservation(second, { idempotencyKey: operation }), cap)
    ])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.filter(result => result.reason === 'idempotency_key_conflict')).toHaveLength(1)
    expect(await jobCount(first.tenantId) + await jobCount(second.tenantId)).toBe(1)
  })

  it('accepts exactly one of two competing 60 cent reservations under a 100 cent cap', async () => {
    const ids = scope()
    const results = await Promise.all([
      reserveAndCreateVideoGenerationJob(reservation(ids), cap),
      reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    ])
    const accepted = results.filter(result => result.ok)
    const rejected = results.filter(result => !result.ok)

    expect(accepted).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: 40 })
    expect(accepted[0].reused).toBe(false)
    expect(accepted[0].job).toMatchObject({
      estimatedCostCents: 60,
      liabilityCents: 60,
      liabilityState: 'reserved',
      dispatchEligible: true
    })

    const rows = (await pool!.query(
      `SELECT id, estimated_cost_cents, liability_cents, liability_state, dispatch_eligible, request_fingerprint, submission_attempted_at
         FROM video_generation_jobs WHERE tenant_id = $1`,
      [ids.tenantId]
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(accepted[0].job?.id)
    expect(Number(rows[0].estimated_cost_cents)).toBe(60)
    expect(Number(rows[0].liability_cents)).toBe(60)
    expect(rows[0].liability_state).toBe('reserved')
    expect(rows[0].dispatch_eligible).toBe(true)
    expect(rows[0].request_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].submission_attempted_at).toBeNull()
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 60, project: 60 })
  })

  it('counts a reported previous month on the project ceiling and leaves it out of the tenant month', async () => {
    const ids = scope()
    const created = await reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    expect(created.ok).toBe(true)
    const jobId = created.job!.id
    const settled = await succeed(jobId, outputHash(`reported-${jobId}`), 60)
    expect(settled.rowCount).toBe(1)
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 60, project: 60 })

    await pool!.query(`UPDATE video_generation_jobs SET completed_at = ${PREVIOUS_UTC_MONTH} WHERE id = $1`, [jobId])
    const months = await pool!.query(
      `SELECT date_trunc('month', (completed_at AT TIME ZONE 'UTC')) = date_trunc('month', (now() AT TIME ZONE 'UTC')) AS completed_same_month,
              date_trunc('month', (created_at AT TIME ZONE 'UTC')) = date_trunc('month', (now() AT TIME ZONE 'UTC')) AS created_same_month
         FROM video_generation_jobs WHERE id = $1`,
      [jobId]
    )
    expect(months.rows[0]).toEqual({ completed_same_month: false, created_same_month: true })
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 0, project: 60 })

    const overProject = await reserveAndCreateVideoGenerationJob(
      reservation(ids, { estimatedCostCents: 50, projectAllowanceCents: 100 }),
      cap
    )
    expect(overProject).toMatchObject({ ok: false, reason: 'project_allowance_exceeded', remainingCents: 40 })
    expect(await jobCount(ids.tenantId)).toBe(1)
    const moved = { ...scope(), projectId: ids.projectId }
    const afterRehome = await reserveAndCreateVideoGenerationJob(
      reservation(moved, { estimatedCostCents: 50, projectAllowanceCents: 100 }), cap)
    expect(afterRehome).toMatchObject({ ok: false, reason: 'project_allowance_exceeded' })
    expect(await jobCount(moved.tenantId)).toBe(0)

    const withinTenantMonth = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 50 }), cap)
    expect(withinTenantMonth.ok).toBe(true)
    expect(withinTenantMonth.job).toMatchObject({ liabilityState: 'reserved', liabilityCents: 50, estimatedCostCents: 50 })
    const reported = await job(jobId)
    expect(reported.liability_state).toBe('reported')
    expect(Number(reported.liability_cents)).toBe(60)
    expect(Number(reported.actual_cost_cents)).toBe(60)
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 50, project: 110 })
    expect(await jobCount(ids.tenantId)).toBe(2)
  })

  it('keeps uncertain liability from a previous month inside the tenant cap', async () => {
    const ids = scope()
    const created = await reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    const jobId = created.job!.id
    const claimed = await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [jobId])
    expect(claimed.rowCount).toBe(1)
    expect(claimed.rows[0].liability_state).toBe('uncertain')
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 60, project: 60 })

    await pool!.query(`UPDATE video_generation_jobs SET created_at = ${PREVIOUS_UTC_MONTH} WHERE id = $1`, [jobId])
    const months = await pool!.query(
      `SELECT date_trunc('month', (created_at AT TIME ZONE 'UTC')) = date_trunc('month', (now() AT TIME ZONE 'UTC')) AS created_same_month
         FROM video_generation_jobs WHERE id = $1`,
      [jobId]
    )
    expect(months.rows[0].created_same_month).toBe(false)

    const row = await job(jobId)
    expect(row.liability_state).toBe('uncertain')
    expect(Number(row.liability_cents)).toBe(60)
    expect(row.submission_attempted_at).not.toBeNull()
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 60, project: 60 })

    const blocked = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 50 }), cap)
    expect(blocked).toMatchObject({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: 40 })
    expect(await jobCount(ids.tenantId)).toBe(1)
  })

  it('explains the cap with a breakdown that totals exactly the enforced liability', async () => {
    const ids = scope()
    const wide: Policy = { enabled: true, monthlyCapCents: 1000 }
    const reported = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 70 }), wide)
    await succeed(reported.job!.id, outputHash('breakdown-reported'), 55)
    const oldReported = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 90 }), wide)
    await succeed(oldReported.job!.id, outputHash('breakdown-old'), 90)
    await pool!.query(`UPDATE video_generation_jobs SET completed_at = ${PREVIOUS_UTC_MONTH} WHERE id = $1`, [oldReported.job!.id])
    const uncertain = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 300 }), wide)
    await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [uncertain.job!.id])
    await pool!.query(`UPDATE video_generation_jobs SET created_at = ${PREVIOUS_UTC_MONTH} WHERE id = $1`, [uncertain.job!.id])
    await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 40 }), wide)

    const enforced = (await sums(ids.tenantId, ids.projectId)).tenant
    const breakdown = await pool!.query(TENANT_VIDEO_GENERATION_LIABILITY_BREAKDOWN_SQL, [ids.tenantId])
    const status = await loadVideoGenerationBudgetStatus(ids.tenantId, { monthlyCapCents: 400 }, async (sql, params) => (await pool!.query(sql, params)).rows)
    expect(status).toEqual({
      capCents: 400,
      committedCents: enforced,
      availableCents: 5,
      reported: { jobs: 1, cents: 55 },
      reserved: { jobs: 1, cents: 40 },
      uncertain: { jobs: 1, cents: 300 }
    })
    expect(enforced).toBe(395)
    expect(breakdown.rows.reduce((sum, row) => sum + Number(row.cents), 0)).toBe(enforced)

    const refused = await reserveAndCreateVideoGenerationJob(reservation(ids, { estimatedCostCents: 10 }), { enabled: true, monthlyCapCents: 400 })
    expect(refused).toMatchObject({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: status.availableCents })
    // Explanation comes from the refusing transaction itself, so it cannot drift across now().
    expect(refused.budget).toEqual(status)
  })

  it('replays an exact key at the original price and rejects a changed prompt or source order', async () => {
    const ids = scope()
    const sourceA = randomUUID()
    const sourceB = randomUUID()
    const key = randomUUID()
    const original = reservation(ids, {
      idempotencyKey: key,
      prompt: 'original prompt',
      sourceAssetIds: [sourceA, sourceB],
      estimatedCostCents: 60
    })
    const created = await reserveAndCreateVideoGenerationJob(original, cap)
    expect(created.ok).toBe(true)
    const fingerprint = created.job?.requestFingerprint
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)

    const replay = await reserveAndCreateVideoGenerationJob(
      reservation(ids, { ...original, estimatedCostCents: 15, id: randomUUID() }),
      cap
    )
    expect(replay).toMatchObject({
      ok: true,
      reused: true,
      job: { id: created.job?.id, estimatedCostCents: 60, liabilityCents: 60, liabilityState: 'reserved' }
    })

    const changedPrompt = await reserveAndCreateVideoGenerationJob(
      reservation(ids, { ...original, prompt: 'changed prompt', estimatedCostCents: 15, id: randomUUID() }),
      cap
    )
    expect(changedPrompt).toMatchObject({ ok: false, reason: 'idempotency_key_conflict' })

    const reordered = await reserveAndCreateVideoGenerationJob(
      reservation(ids, { ...original, sourceAssetIds: [sourceB, sourceA], estimatedCostCents: 15, id: randomUUID() }),
      cap
    )
    expect(reordered).toMatchObject({ ok: false, reason: 'idempotency_key_conflict' })

    const rows = (await pool!.query(
      `SELECT prompt, source_asset_ids, estimated_cost_cents, liability_cents, actual_cost_cents, liability_state, request_fingerprint
         FROM video_generation_jobs WHERE tenant_id = $1`,
      [ids.tenantId]
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].prompt).toBe('original prompt')
    expect(rows[0].source_asset_ids).toEqual([sourceA, sourceB])
    expect(Number(rows[0].estimated_cost_cents)).toBe(60)
    expect(Number(rows[0].liability_cents)).toBe(60)
    expect(rows[0].actual_cost_cents).toBeNull()
    expect(rows[0].liability_state).toBe('reserved')
    expect(rows[0].request_fingerprint).toBe(fingerprint)
  })

  it('lets one concurrent submission claim win', async () => {
    const ids = scope()
    const created = await reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    const jobId = created.job!.id
    const claims = await Promise.all([
      pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [jobId]),
      pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [jobId])
    ])
    expect(claims.filter(result => result.rowCount === 1)).toHaveLength(1)
    expect(claims.filter(result => result.rowCount === 0)).toHaveLength(1)

    const again = await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [jobId])
    expect(again.rowCount).toBe(0)
    const row = await job(jobId)
    expect(row.status).toBe('running')
    expect(row.liability_state).toBe('uncertain')
    expect(Number(row.liability_cents)).toBe(60)
    expect(row.submission_attempted_at).not.toBeNull()
    expect(row.dispatch_eligible).toBe(true)
    expect(await jobCount(ids.tenantId)).toBe(1)
  })

  it('refuses a claim when the reservation is not dispatch eligible', async () => {
    const ids = scope()
    const created = await reserveAndCreateVideoGenerationJob(reservation(ids, { dispatchEligible: false }), cap)
    expect(created.job?.dispatchEligible).toBe(false)
    const claim = await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [created.job!.id])
    expect(claim.rowCount).toBe(0)
    expect(claim.rows).toEqual([])

    const row = await job(created.job!.id)
    expect(row.dispatch_eligible).toBe(false)
    expect(row.status).toBe('queued')
    expect(row.liability_state).toBe('reserved')
    expect(Number(row.liability_cents)).toBe(60)
    expect(row.submission_attempted_at).toBeNull()
    expect(row.request_fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not let a stale reaper failure release a claimed queued job', async () => {
    const ids = scope()
    const room: Policy = { enabled: true, monthlyCapCents: 200 }
    const claimedJob = await reserveAndCreateVideoGenerationJob(reservation(ids), room)
    const unclaimedJob = await reserveAndCreateVideoGenerationJob(reservation(ids), room)
    expect(claimedJob.ok).toBe(true)
    expect(unclaimedJob.ok).toBe(true)
    const claimedId = claimedJob.job!.id
    const unclaimedId = unclaimedJob.job!.id
    expect((await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [claimedId])).rowCount).toBe(1)

    const stale = await pool!.query(FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL, [claimedId, 'stale reaper'])
    expect(stale.rowCount).toBe(0)
    expect(stale.rows).toEqual([])

    const released = await pool!.query(FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL, [unclaimedId, 'unclaimed reaper'])
    expect(released.rowCount).toBe(1)

    const claimed = await job(claimedId)
    expect(claimed.status).toBe('running')
    expect(claimed.liability_state).toBe('uncertain')
    expect(Number(claimed.liability_cents)).toBe(60)
    expect(claimed.submission_attempted_at).not.toBeNull()
    expect(claimed.error_message).toBeNull()
    expect(claimed.provider_request_id).toBeNull()

    const unclaimed = await job(unclaimedId)
    expect(unclaimed.status).toBe('failed')
    expect(unclaimed.liability_state).toBe('released')
    expect(Number(unclaimed.liability_cents)).toBe(0)
    expect(unclaimed.error_message).toBe('unclaimed reaper')

    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 60, project: 60 })
  })

  it('stores the canonical output hash and ignores later fail, running, and unknown writes', async () => {
    const ids = scope()
    const created = await reserveAndCreateVideoGenerationJob(reservation(ids), cap)
    const jobId = created.job!.id
    const hash = outputHash(`canonical-${jobId}`)
    expect((await pool!.query(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [jobId])).rowCount).toBe(1)

    const settled = await succeed(jobId, hash, 47)
    expect(settled.rowCount).toBe(1)
    expect(settled.rows[0].output_sha256).toBe(hash)
    expect(settled.rows[0].output_asset_id).toBeNull()
    expect(settled.rows[0].status).toBe('succeeded')
    expect(settled.rows[0].liability_state).toBe('reported')
    expect(Number(settled.rows[0].actual_cost_cents)).toBe(47)
    expect(Number(settled.rows[0].liability_cents)).toBe(47)

    const snapshot = await job(jobId)
    expect((await pool!.query(MARK_VIDEO_GENERATION_FAILED_SQL, [jobId, 'later fail', false, null])).rowCount).toBe(0)
    expect((await pool!.query(MARK_VIDEO_GENERATION_RUNNING_SQL, [jobId, 'provider-should-not-stick'])).rowCount).toBe(0)
    expect((await pool!.query(MARK_VIDEO_GENERATION_UNKNOWN_SQL, [jobId, 'later unknown', 'provider-unknown'])).rowCount).toBe(0)

    const after = await job(jobId)
    expect(after.output_sha256).toBe(hash)
    expect(after.output_asset_id).toBeNull()
    expect(after.status).toBe('succeeded')
    expect(after.provider_status).toBe(snapshot.provider_status)
    expect(after.provider_result_url).toBe(snapshot.provider_result_url)
    expect(after.provider_request_id).toBeNull()
    expect(after.error_message).toBeNull()
    expect(after.output_r2_key).toBeNull()
    expect(Number(after.actual_cost_cents)).toBe(47)
    expect(after.liability_state).toBe('reported')
    expect(Number(after.liability_cents)).toBe(47)
    expect(new Date(after.completed_at).toISOString()).toBe(new Date(snapshot.completed_at).toISOString())
    expect(new Date(after.submission_attempted_at).toISOString()).toBe(new Date(snapshot.submission_attempted_at).toISOString())
  })

  it('fails closed for NaN, negative, and fractional caps', async () => {
    const ids = scope()
    for (const monthlyCapCents of [Number.NaN, -20, 100.5]) {
      const result = await reserveAndCreateVideoGenerationJob(reservation(ids), { enabled: true, monthlyCapCents })
      expect(result).toMatchObject({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: 0 })
    }
    expect(await jobCount(ids.tenantId)).toBe(0)

    for (const projectAllowanceCents of [Number.NaN, -20, 100.5]) {
      const result = await reserveAndCreateVideoGenerationJob(
        reservation(ids, { projectAllowanceCents }),
        cap
      )
      expect(result).toMatchObject({ ok: false, reason: 'project_allowance_exceeded', remainingCents: 0 })
    }
    expect(await jobCount(ids.tenantId)).toBe(0)
    expect(await sums(ids.tenantId, ids.projectId)).toEqual({ tenant: 0, project: 0 })
  })
})
