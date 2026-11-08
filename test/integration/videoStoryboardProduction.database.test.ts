import { createHash, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProjectIn, type MediaProjectActor } from '~~/server/utils/audio/projects'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import { canonicalReferenceIn } from '~~/server/utils/video-storyboard/references'
import { getStoryboardIn, saveReferenceSetIn, saveStoryboardRevisionIn, type StoryboardRevision } from '~~/server/utils/video-storyboard/store'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'
import { setProjectProductionAllowanceIn } from '~~/server/utils/video-storyboard/productionBudget'
import {
  approveShotArtifactIn,
  cancelShotAttemptIn,
  reserveShotAttemptIn,
  type ReserveShotAttemptInput,
  type ShotProductionDependencies
} from '~~/server/utils/video-storyboard/production'
import { MARK_VIDEO_GENERATION_SUCCEEDED_SQL } from '~~/shared/video/generationLiability'
import type { ShotProductionAttempt } from '~~/shared/video/storyboardProduction'
import { storyboardFixture } from '../video/fixtures/storyboard'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
if (connectionString) {
  const url = new URL(connectionString)
  const isolatedLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && url.pathname === '/video_storyboard_recovery_test'
    && Boolean(url.port)
    && !url.search
  if (!isolatedLocal) {
    throw new Error('STORYBOARD_TEST_DATABASE_URL must be localhost with an explicit port, pathname /video_storyboard_recovery_test, and no query')
  }
}
const pool = connectionString ? new Pool({ connectionString, max: 2 }) : null

vi.mock('~~/server/utils/storage', () => ({
  getFileMetadata: async () => ({ etag: 'production-source-v1', size: 128, contentType: 'image/png' }),
  getPresignedDownloadUrl: async () => { throw new Error('Media downloads are forbidden in this database fixture') }
}))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({
  probeStoryboardMedia: async () => ({ kind: 'image', durationSeconds: null, width: 1080, height: 1920 })
}))

const model = getVideoGenerationModel('aigateway/seedance-i2v')
if (!model) throw new Error('Registered storyboard production model is missing')
const deps: ShotProductionDependencies = {
  loadTenantPolicy: async () => ({ enabled: true, monthlyCapCents: 10_000, allowedModelIds: [model.id] }),
  getModel: id => id === model.id ? model : null
}

async function withRollback<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool!.connect()
  try {
    await db.query('BEGIN')
    return await run(db)
  } finally {
    await db.query('ROLLBACK')
    db.release()
  }
}

async function expectImmutable(db: PoolClient, sql: string, params: unknown[]) {
  await db.query('SAVEPOINT expected_immutable_write')
  try {
    await expect(db.query(sql, params)).rejects.toMatchObject({ code: '55000' })
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT expected_immutable_write')
    await db.query('RELEASE SAVEPOINT expected_immutable_write')
  }
}

interface Fixture {
  projectId: string
  sourceId: string
  actor: MediaProjectActor
  outsider: MediaProjectActor
  revision: StoryboardRevision
}

async function fixture(db: PoolClient): Promise<Fixture> {
  const actor = { id: randomUUID(), role: 'owner' }
  const outsider = { id: randomUUID(), role: 'member' }
  const roleId = randomUUID()
  await db.query(`INSERT INTO custom_roles (id, name, slug, is_read_only) VALUES ($1, 'Production test role', $2, false)`, [roleId, `production-${roleId}`])
  await db.query(
    `INSERT INTO team_members (id, name, email, user_role, custom_role_id, is_active)
     VALUES ($1, 'Production owner', $2, 'owner', $3, true), ($4, 'Production outsider', $5, 'member', $3, true)`,
    [actor.id, `${actor.id}@example.invalid`, roleId, outsider.id, `${outsider.id}@example.invalid`]
  )
  const created = await createProjectIn(db, { createdBy: actor.id, clientId: null, title: 'Production rollback fixture', mediaType: 'av', initialState: emptyAvTimeline() })
  const projectId = created.project.id
  const sourceId = randomUUID()
  await db.query(
    `INSERT INTO video_gen_source_assets (id, client_id, created_by, r2_key, content_type, status, subject_type)
     VALUES ($1, NULL, $2, $3, 'image/png', 'approved', 'non_vehicle')`,
    [sourceId, actor.id, `synthetic/storyboard-production/${sourceId}.png`]
  )
  const project = { id: projectId, clientId: null, createdBy: actor.id }
  const identity = await canonicalReferenceIn(db, project, actor, 'source_asset', sourceId)
  const referenceSet = await saveReferenceSetIn(db, {
    projectId, actor, expectedRevision: null, operationId: randomUUID(), brandKit: null,
    references: [{ role: 'product', sourceKind: 'source_asset', assetId: sourceId, expectedContentHash: identity.contentHash, decision: 'approved', evidence: 'Synthetic approved source' }]
  })
  const root = await getStoryboardIn(db, projectId, actor)
  const plan = storyboardFixture()
  plan.id = root.storyboard!.id
  plan.projectId = projectId
  plan.revision = randomUUID()
  plan.referenceSetRevisionId = referenceSet.id
  plan.copy.contentHash = storyboardHash({ scriptSegments: plan.copy.scriptSegments, cues: plan.copy.cues })
  plan.copy.approval = null
  plan.shots = plan.shots.map(shot => ({ ...shot, visual: { status: 'bound', sourceKind: 'source_asset', assetId: sourceId, contentHash: identity.contentHash } }))
  const revision = await saveStoryboardRevisionIn(db, {
    projectId, actor, expectedRevision: null, operationId: randomUUID(), plan,
    approveCopy: true, expectedCopyHash: plan.copy.contentHash
  })
  await setProjectProductionAllowanceIn(db, { projectId, actor, allowanceCents: 1_000 })
  return { projectId, sourceId, actor, outsider, revision }
}

function reservation(f: Fixture, operationId = randomUUID()): ReserveShotAttemptInput {
  return {
    projectId: f.projectId, actor: f.actor, shotId: f.revision.plan.shots[0]!.id,
    expectedRevision: f.revision.id, operationId, modelId: model.id,
    sourceAssetIds: [f.sourceId], prompt: 'Slow product reveal'
  }
}

function approval(f: Fixture, attempt: ShotProductionAttempt, artifactHash: string) {
  return {
    projectId: f.projectId, attemptId: attempt.id, expectedRevision: f.revision.id,
    expectedShotRevision: { revisionId: f.revision.id, shotHash: attempt.shotHash },
    artifactHash, actor: f.actor
  }
}

// Simulated finalization only: no provider, network, media download, or hosted acceptance.
async function simulateSuccess(db: PoolClient, f: Fixture, attempt: ShotProductionAttempt) {
  const artifactHash = createHash('sha256').update(`simulated-${attempt.jobId}`).digest('hex')
  const assetId = randomUUID()
  const r2Key = `synthetic/storyboard-production/${attempt.jobId}.mp4`
  await db.query(
    `INSERT INTO video_assets (id, client_id, created_by, title, source_project_id, source_job_id, r2_key, format, generated_output_sha256)
     VALUES ($1, NULL, $2, 'Simulated production output', $3, $4, $5, 'mp4', $6)`,
    [assetId, f.actor.id, f.projectId, attempt.jobId, r2Key, artifactHash]
  )
  // Simulate a previously claimed submission; the canonical success CAS rejects unclaimed jobs.
  await db.query('UPDATE video_generation_jobs SET submission_attempted_at=now() WHERE id=$1', [attempt.jobId])
  const result = await db.query(MARK_VIDEO_GENERATION_SUCCEEDED_SQL, [
    attempt.jobId, 'simulated-ready', `memory://simulated/${attempt.jobId}`, assetId, r2Key, 150, artifactHash
  ])
  expect(result.rowCount).toBe(1)
  return artifactHash
}

describe.skipIf(!pool)('storyboard production canonical PostgreSQL services', () => {
  beforeAll(async () => {
    expect((await pool!.query('SELECT current_database() AS name')).rows[0].name).toBe('video_storyboard_recovery_test')
  })
  afterAll(async () => {
    await pool?.end()
  })

  it('reserves one immutable held request, replays its original price, and rejects a changed body', () => withRollback(async (db) => {
    const f = await fixture(db)
    const request = reservation(f)
    const original = await reserveShotAttemptIn(db, request, deps)
    expect(original).toMatchObject({ estimatedCents: 150, executionState: 'queued', liabilityState: 'reserved', liabilityCents: 150, actualSeed: null, providerModelRevision: null })
    expect(original.requestSnapshot).toMatchObject({ operationId: request.operationId, actualSeed: null, providerModelRevision: null, durationSeconds: 5, estimatedCents: 150 })
    const job = (await db.query('SELECT * FROM video_generation_jobs WHERE id=$1', [original.jobId])).rows[0]
    expect(job).toMatchObject({ status: 'queued', dispatch_eligible: false, submission_attempted_at: null, liability_state: 'reserved' })
    expect(job.request_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(Number(job.liability_cents)).toBe(150)

    const replay = await reserveShotAttemptIn(db, request, deps)
    expect(replay).toEqual(original)
    await expect(reserveShotAttemptIn(db, { ...request, prompt: 'Changed body' }, deps)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT count(*)::int n FROM video_storyboard_shot_attempts WHERE project_id=$1', [f.projectId])).rows[0].n).toBe(1)
    expect((await db.query('SELECT count(*)::int n FROM video_generation_jobs WHERE project_id=$1', [f.projectId])).rows[0].n).toBe(1)
    await expectImmutable(db, 'UPDATE video_storyboard_shot_attempts SET model_id=$2 WHERE id=$1', [original.id, 'tampered/model'])
  }))

  it('approves the actual output hash with valid pins and rejects wrong project, actor, and approval mutation', () => withRollback(async (db) => {
    const f = await fixture(db)
    const attempt = await reserveShotAttemptIn(db, reservation(f), deps)
    const artifactHash = await simulateSuccess(db, f, attempt)
    await expect(approveShotArtifactIn(db, approval(f, attempt, '0'.repeat(64)), deps)).rejects.toMatchObject({ statusCode: 409 })
    const approved = await approveShotArtifactIn(db, approval(f, attempt, artifactHash), deps)
    expect(approved).toMatchObject({ executionState: 'ready', reviewState: 'approved', stage: 'approved', artifactSha256: artifactHash, reportedCents: 150 })

    const other = await createProjectIn(db, { createdBy: f.actor.id, clientId: null, title: 'Wrong project', mediaType: 'av', initialState: emptyAvTimeline() })
    await expect(approveShotArtifactIn(db, { ...approval(f, attempt, artifactHash), projectId: other.project.id }, deps)).rejects.toMatchObject({ statusCode: 404 })
    await expect(approveShotArtifactIn(db, { ...approval(f, attempt, artifactHash), actor: f.outsider }, deps)).rejects.toMatchObject({ statusCode: 403 })
    await expectImmutable(db, 'UPDATE video_storyboard_shot_approvals SET actor_id=$2 WHERE attempt_id=$1', [attempt.id, f.outsider.id])
    await expectImmutable(db, 'UPDATE video_storyboard_production_allowance_audits SET allowance_cents=0 WHERE project_id=$1', [f.projectId])
  }))

  it('rejects stale copy and a revoked approved source', () => withRollback(async (db) => {
    const f = await fixture(db)
    const attempt = await reserveShotAttemptIn(db, reservation(f), deps)
    const artifactHash = await simulateSuccess(db, f, attempt)
    const stale = structuredClone(f.revision.plan)
    stale.revision = randomUUID()
    stale.copy.id = randomUUID()
    stale.copyRevisionId = stale.copy.id
    stale.copy.revision += 1
    stale.copy.scriptSegments[0]!.text += ' Revised copy.'
    stale.copy.contentHash = storyboardHash({ scriptSegments: stale.copy.scriptSegments, cues: stale.copy.cues })
    stale.copy.approval = null
    await saveStoryboardRevisionIn(db, { projectId: f.projectId, actor: f.actor, expectedRevision: f.revision.id, operationId: randomUUID(), plan: stale, approveCopy: true, expectedCopyHash: stale.copy.contentHash })
    await expect(approveShotArtifactIn(db, approval(f, attempt, artifactHash), deps)).rejects.toMatchObject({ statusCode: 409 })

    const second = await reserveShotAttemptIn(db, { ...reservation(f), expectedRevision: stale.revision }, deps)
    expect(second.storyboardRevisionId).toBe(stale.revision)
    const secondHash = await simulateSuccess(db, f, second)
    await db.query(`UPDATE video_gen_source_assets SET status='revoked' WHERE id=$1`, [f.sourceId])
    await expect(approveShotArtifactIn(db, { ...approval(f, second, secondHash), expectedRevision: stale.revision, expectedShotRevision: { revisionId: stale.revision, shotHash: second.shotHash } }, deps)).rejects.toMatchObject({ statusCode: 409, data: { codes: ['reference_unavailable'] } })
  }))

  it('cancels only its own held job and retains claimed unknown liability', () => withRollback(async (db) => {
    const f = await fixture(db)
    const unclaimed = await reserveShotAttemptIn(db, reservation(f), deps)
    const claimed = await reserveShotAttemptIn(db, reservation(f), deps)
    await db.query(`UPDATE video_generation_jobs SET status='unknown', submission_attempted_at=now(), liability_state='uncertain' WHERE id=$1`, [claimed.jobId])
    const released = await cancelShotAttemptIn(db, { projectId: f.projectId, attemptId: unclaimed.id, actor: f.actor })
    expect(released).toMatchObject({ executionState: 'cancelled', liabilityState: 'released', liabilityCents: 0 })
    const retainedBefore = (await db.query('SELECT liability_state, liability_cents FROM video_generation_jobs WHERE id=$1', [claimed.jobId])).rows[0]
    expect(retainedBefore).toMatchObject({ liability_state: 'uncertain', liability_cents: 150 })
    const cancelled = await cancelShotAttemptIn(db, { projectId: f.projectId, attemptId: claimed.id, actor: f.actor })
    expect(cancelled).toMatchObject({ executionState: 'cancelled', liabilityState: 'uncertain', liabilityCents: 150 })
    const jobs = (await db.query('SELECT id, status, liability_state, liability_cents FROM video_generation_jobs WHERE id=ANY($1::uuid[]) ORDER BY id', [[unclaimed.jobId, claimed.jobId]])).rows
    expect(jobs).toHaveLength(2)
    expect(jobs.find(job => job.id === unclaimed.jobId)).toMatchObject({ status: 'failed', liability_state: 'released', liability_cents: 0 })
    expect(jobs.find(job => job.id === claimed.jobId)).toMatchObject({ status: 'unknown', liability_state: 'uncertain', liability_cents: 150 })
  }))

  it('rejects replay, cancellation and approval after project rehome without creating a new request', () => withRollback(async (db) => {
    const f = await fixture(db)
    const request = reservation(f)
    const attempt = await reserveShotAttemptIn(db, request, deps)
    const clientId = randomUUID()
    await db.query(`INSERT INTO agency_clients (id, is_active) VALUES ($1, true)`, [clientId])
    await db.query('UPDATE media_projects SET client_id=$2 WHERE id=$1', [f.projectId, clientId])
    await expect(reserveShotAttemptIn(db, request, deps)).rejects.toMatchObject({ statusCode: 409 })
    await expect(cancelShotAttemptIn(db, { projectId: f.projectId, attemptId: attempt.id, actor: f.actor })).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT count(*)::int n FROM video_storyboard_shot_attempts WHERE project_id=$1', [f.projectId])).rows[0].n).toBe(1)
    const artifactHash = await simulateSuccess(db, f, attempt)
    await expect(approveShotArtifactIn(db, approval(f, attempt, artifactHash), deps)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Production attempt belongs to the previous project client' })
  }))
})
