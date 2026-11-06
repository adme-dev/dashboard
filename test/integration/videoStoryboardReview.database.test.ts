import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProject, saveDraftTimeline, getProjectWithCurrentTimeline, createVersion, createRenderJob, restoreTimelineVersionIn } from '~~/server/utils/audio/projects'
import { reviewAdjustedTimeline } from '~~/server/utils/video-storyboard/timelineReview'
import { validateStoryboardRender } from '~~/server/utils/video-storyboard/renderValidation'
import { loadTimelineObligationsIn } from '~~/server/utils/video-storyboard/lineage'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { getStoryboard, saveReferenceSet, saveStoryboardRevision } from '~~/server/utils/video-storyboard/store'
import { applyStoryboard, applyStoryboardIn, prepareStoryboardApplication, getStoryboardApplication } from '~~/server/utils/video-storyboard/apply'
import { canonicalReferenceIn } from '~~/server/utils/video-storyboard/references'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'
import { transaction } from '~~/server/utils/db'
import { storyboardFixture } from '../video/fixtures/storyboard'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
const host = process.env.STORYBOARD_TEST_DATABASE_HOST
if (connectionString && (new URL(connectionString).hostname !== host || host !== 'ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech')) throw new Error('Only the verified isolated storyboard branch is allowed')
const pool = connectionString ? new Pool({ connectionString, max: 6 }) : null
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows[0],
  queryOne: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows[0],
  queryRows: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows,
  transaction: async (operation: (db: unknown) => Promise<unknown>) => {
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
}))
// Real production SQL/core/compiler; only synthetic private-media transport is stubbed.
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: async () => ({ etag: 'fixture-etag', size: 128, contentType: 'image/png' }) }))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({ probeStoryboardMedia: async () => ({ kind: 'image', durationSeconds: null, width: 1080, height: 1920 }) }))
const actor = { id: randomUUID(), role: 'member' }
const roleId = randomUUID()
const projects: string[] = []
const assets: string[] = []
async function fixture() {
  const created = await createProject({ createdBy: actor.id, clientId: null, title: 'Synthetic T08 atomic apply fixture', mediaType: 'av', initialState: emptyAvTimeline() })
  const projectId = created.project.id
  projects.push(projectId)
  const asset = randomUUID()
  assets.push(asset)
  await pool!.query(`INSERT INTO video_assets (id, title, r2_key, format, created_by) VALUES ($1,'Synthetic T08 still','synthetic/t06.png','png',$2)`, [asset, actor.id])
  const identity = await transaction(db => canonicalReferenceIn(db, { id: projectId, clientId: null, createdBy: actor.id }, actor, 'video_asset', asset))
  const refs = await saveReferenceSet({ projectId, actor, expectedRevision: null, operationId: randomUUID(), references: [{ role: 'product', sourceKind: 'video_asset', assetId: asset, expectedContentHash: identity.contentHash, decision: 'approved', evidence: 'Synthetic approved test fixture' }], brandKit: null })
  const root = await getStoryboard(projectId, actor)
  const plan = storyboardFixture()
  plan.id = root.storyboard!.id
  plan.projectId = projectId
  plan.revision = randomUUID()
  plan.referenceSetRevisionId = refs.id
  plan.copy.id = plan.copyRevisionId = randomUUID()
  plan.copy.scriptSegments = []
  plan.copy.cues = []
  plan.copy.approval = null
  plan.copy.contentHash = storyboardHash({ scriptSegments: [], cues: [] })
  plan.shots.forEach((shot) => {
    shot.spokenSegmentIds = []
    shot.copyCueIds = []
    shot.visual = { status: 'bound', sourceKind: 'video_asset', assetId: asset, contentHash: refs.references[0]!.contentHash }
  })
  await saveStoryboardRevision({ projectId, actor, expectedRevision: null, operationId: randomUUID(), plan, approveCopy: true, expectedCopyHash: plan.copy.contentHash })
  return { actor, projectId, operationId: randomUUID(), revisionId: plan.revision, expectedTimelineId: created.timeline.id, expectedEditRevision: 0, replaceConfirmed: true }
}
async function counts(projectId: string) {
  return (await pool!.query(`SELECT (SELECT count(*)::int FROM media_timelines WHERE project_id=$1) timelines,
    (SELECT count(*)::int FROM video_storyboard_applications WHERE project_id=$1) applications,
    (SELECT count(*)::int FROM video_storyboard_timeline_obligations WHERE project_id=$1) obligations`, [projectId])).rows[0]
}
describe.skipIf(!pool)('isolated storyboard review and render lineage', { timeout: 90000 }, () => {
  beforeAll(async () => {
    await pool!.query(`INSERT INTO custom_roles (id, name, slug, is_read_only) VALUES ($1, 'Synthetic T08 role', $2, false)`, [roleId, `t08-${roleId}`])
    await pool!.query(`INSERT INTO team_members (id, name, email, user_role, custom_role_id, is_active) VALUES ($1, 'Synthetic T08 actor', $2, 'member', $3, true)`, [actor.id, `t08-${actor.id}@example.invalid`, roleId])
  }, 30000)
  afterAll(async () => {
    for (const projectId of projects) {
      await pool!.query('DELETE FROM media_render_jobs WHERE project_id=$1', [projectId])
      await pool!.query('DELETE FROM media_projects WHERE id=$1', [projectId])
    }
    for (const asset of assets) await pool!.query('DELETE FROM video_assets WHERE id=$1', [asset])
    await pool!.query('DELETE FROM team_members WHERE id=$1', [actor.id])
    await pool!.query('DELETE FROM custom_roles WHERE id=$1', [roleId])
    await pool!.end()
  }, 30000)
  it('preserves obligations through save, version, render snapshot and explicit version restore', async () => {
    const input = await fixture()
    const applied = await applyStoryboard(input)
    const before = { ...input, expectedTimelineId: applied.after.timelineId, expectedEditRevision: applied.after.editRevision }
    const version = await createVersion(before)
    const saved = await saveDraftTimeline({ ...before, expectedTimelineId: version.id, expectedEditRevision: version.editRevision, state: emptyAvTimeline() })
    const savedContract = await transaction(db => loadTimelineObligationsIn(db, input.projectId, saved.id, saved.editRevision))
    expect(savedContract!.contract.sources).toHaveLength(6)
    const restored = await transaction(db => restoreTimelineVersionIn(db, { ...input, expectedTimelineId: saved.id, expectedEditRevision: saved.editRevision, restoreTimelineId: applied.after.timelineId }))
    expect(restored.state).toEqual(applied.afterState)
    const restoredContract = await transaction(db => loadTimelineObligationsIn(db, input.projectId, restored.id, restored.editRevision))
    expect(restoredContract!.contract).toEqual(savedContract!.contract)
    const job = await createRenderJob({ ...input, expectedTimelineId: restored.id, expectedEditRevision: restored.editRevision, channels: [] })
    expect(await transaction(db => loadTimelineObligationsIn(db, input.projectId, job.timelineId, 0))).not.toBeNull()
  })
  it('records two immutable reviews on the same cut, retries idempotently and rejects stale review CAS', async () => {
    const input = await fixture()
    const applied = await applyStoryboard(input)
    const reviewInput = { actor, projectId: input.projectId, expectedTimelineId: applied.after.timelineId, expectedEditRevision: applied.after.editRevision, operationId: randomUUID(), obligationMappings: [] }
    const [first, replay] = await Promise.all([reviewAdjustedTimeline(reviewInput), reviewAdjustedTimeline(reviewInput)])
    expect(first.review.id).toBe(replay.review.id)
    const second = await reviewAdjustedTimeline({ ...reviewInput, operationId: randomUUID() })
    expect(second.review.id).not.toBe(first.review.id)
    const current = await getProjectWithCurrentTimeline(input.projectId)
    expect(current!.timeline!.state).toEqual(applied.afterState)
    expect(current!.timeline!.editRevision).toBe(applied.after.editRevision)
    const effective = await transaction(db => loadTimelineObligationsIn(db, input.projectId, applied.after.timelineId, applied.after.editRevision))
    expect(effective!.review!.id).toBe(second.review.id)
    await expect(pool!.query('UPDATE video_storyboard_timeline_reviews SET request_hash=request_hash WHERE id=$1', [second.review.id])).rejects.toMatchObject({ code: '55000' })
    await saveDraftTimeline({ ...reviewInput, state: applied.afterState })
    await expect(reviewAdjustedTimeline({ ...reviewInput, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('manifest foreign keys reject a job/timeline mismatch and history updates', async () => {
    const input = await fixture(); const applied = await applyStoryboard(input)
    const job = await createRenderJob({ ...input, expectedTimelineId: applied.after.timelineId, expectedEditRevision: applied.after.editRevision, channels: [] })
    const params = [job.id, randomUUID(), input.projectId, applied.after.timelineId, '{}', 'a'.repeat(64)]
    const insert = `INSERT INTO video_storyboard_render_manifests(job_id,id,project_id,timeline_id,edit_revision,manifest,manifest_hash) VALUES($1,$2,$3,$4,0,$5,$6)`
    await expect(pool!.query(insert, params)).rejects.toMatchObject({ code: '23503' })
    params[3] = job.timelineId; await pool!.query(insert, params)
    await expect(pool!.query('UPDATE video_storyboard_render_manifests SET manifest=manifest WHERE job_id=$1', [job.id])).rejects.toMatchObject({ code: '55000' })
  })
  it('scopes explicit flag-off copy/reference approvals to this cut and rolls back invalid revised copy', async () => {
    const input = await fixture()
    const applied = await applyStoryboard(input)
    const saved = await getStoryboard(input.projectId, actor)
    const ref = saved.referenceSet!.references[0]!
    await pool!.query('UPDATE video_assets SET updated_at=now() WHERE id=$1', [ref.assetId])
    const identity = await transaction(db => canonicalReferenceIn(db, { id: input.projectId, clientId: null, createdBy: actor.id }, actor, ref.sourceKind, ref.assetId))
    const reviewInput = { actor, projectId: input.projectId, expectedTimelineId: applied.after.timelineId, expectedEditRevision: applied.after.editRevision, operationId: randomUUID(), obligationMappings: [],
      copyApproval: { expectedCopyHash: saved.revision!.plan.copy.contentHash, scriptSegments: [], cues: [] },
      referenceApproval: [{ sourceKind: ref.sourceKind, assetId: ref.assetId, expectedContentHash: identity.contentHash, evidence: 'Human reviewed synthetic updated source for same edit' }] }
    const beforeFlag = process.env.VIDEO_STORYBOARD_ENABLED
    process.env.VIDEO_STORYBOARD_ENABLED = 'false'
    try {
      const review = await reviewAdjustedTimeline(reviewInput)
      const record = await transaction(db => loadTimelineObligationsIn(db, input.projectId, applied.after.timelineId, applied.after.editRevision))
      expect(record!.review!.id).toBe(review.review.id)
      expect(record!.contract.copyRevisionId).not.toBe(applied.storyboardRevisionId)
      expect((await pool!.query('SELECT count(*)::int count FROM video_storyboard_review_copies WHERE project_id=$1', [input.projectId])).rows[0].count).toBe(1)
      const currentRefs = (await getStoryboard(input.projectId, actor)).referenceSet!.id
      expect(currentRefs).toBe(saved.referenceSet!.id)
      expect(record!.referenceSetId).not.toBe(currentRefs)
      await expect(reviewAdjustedTimeline({ ...reviewInput, operationId: randomUUID(), copyApproval: { ...reviewInput.copyApproval, cues: [{ id: 'unmapped', text: 'New required claim', required: true }] } })).rejects.toMatchObject({ statusCode: 409 })
      expect((await pool!.query('SELECT count(*)::int count FROM video_storyboard_review_copies WHERE project_id=$1', [input.projectId])).rows[0].count).toBe(1)
      expect((await getStoryboard(input.projectId, actor)).referenceSet!.id).toBe(currentRefs)
      expect((await getProjectWithCurrentTimeline(input.projectId))!.timeline!.state).toEqual(applied.afterState)
      await saveReferenceSet({ projectId: input.projectId, actor, expectedRevision: currentRefs, operationId: randomUUID(), references: [{ role: ref.role, sourceKind: ref.sourceKind, assetId: ref.assetId, expectedContentHash: identity.contentHash, decision: 'revoked', evidence: 'Later global revocation' }], brandKit: null })
      const findings = await validateStoryboardRender({ actor, projectId: input.projectId, timelineId: applied.after.timelineId, editRevision: applied.after.editRevision, formats: ['reels_9x16'] })
      expect(findings.map(f => f.code)).toContain('reference_review_required')
    } finally {
      if (beforeFlag === undefined) delete process.env.VIDEO_STORYBOARD_ENABLED
      else process.env.VIDEO_STORYBOARD_ENABLED = beforeFlag
    }
  }, 180000)
})
