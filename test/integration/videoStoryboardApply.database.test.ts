import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProject, saveDraftTimeline, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
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
  const created = await createProject({ createdBy: actor.id, clientId: null, title: 'Synthetic T06 atomic apply fixture', mediaType: 'av', initialState: emptyAvTimeline() })
  const projectId = created.project.id
  projects.push(projectId)
  const asset = randomUUID()
  assets.push(asset)
  await pool!.query(`INSERT INTO video_assets (id, title, r2_key, format, created_by) VALUES ($1,'Synthetic T06 still','synthetic/t06.png','png',$2)`, [asset, actor.id])
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
describe.skipIf(!pool)('isolated atomic storyboard applications', { timeout: 90000 }, () => {
  beforeAll(async () => {
    await pool!.query(`INSERT INTO custom_roles (id, name, slug, is_read_only) VALUES ($1, 'Synthetic T06 role', $2, false)`, [roleId, `t06-${roleId}`])
    await pool!.query(`INSERT INTO team_members (id, name, email, user_role, custom_role_id, is_active) VALUES ($1, 'Synthetic T06 actor', $2, 'member', $3, true)`, [actor.id, `t06-${actor.id}@example.invalid`, roleId])
  }, 30000)
  afterAll(async () => {
    for (const projectId of projects) await pool!.query('DELETE FROM media_projects WHERE id=$1', [projectId])
    for (const asset of assets) await pool!.query('DELETE FROM video_assets WHERE id=$1', [asset])
    await pool!.query('DELETE FROM team_members WHERE id=$1', [actor.id])
    await pool!.query('DELETE FROM custom_roles WHERE id=$1', [roleId])
    await pool!.end()
  }, 30000)
  it('races identical requests into one edit and recovers the immutable receipt after later edits', async () => {
    const input = await fixture()
    const [a, b] = await Promise.all([applyStoryboard(input), applyStoryboard(input)])
    expect(a).toEqual(b)
    expect(await counts(input.projectId)).toEqual({ timelines: 2, applications: 1, obligations: 1 })
    await saveDraftTimeline({ ...input, expectedTimelineId: a.after.timelineId, expectedEditRevision: a.after.editRevision, state: emptyAvTimeline() })
    expect(await applyStoryboard(input)).toEqual(a)
    expect(await getStoryboardApplication(input)).toEqual(a)
    await expect(applyStoryboard({ ...input, replaceConfirmed: false })).rejects.toMatchObject({ statusCode: 409 })
    await expect(getStoryboardApplication({ ...input, actor: { id: randomUUID(), role: 'member' } })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('serializes apply versus autosave and rejects the stale loser', async () => {
    const input = await fixture()
    const prepared = await prepareStoryboardApplication(input)
    const results = await Promise.allSettled([
      transaction(db => applyStoryboardIn(db, input, prepared)),
      saveDraftTimeline({ ...input, state: emptyAvTimeline() })
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(409)
  })
  it.each(['checkpoint', 'receipt', 'obligation'])('rolls back every side effect when %s persistence fails', async (stage) => {
    const input = await fixture()
    const prepared = await prepareStoryboardApplication(input)
    const pattern = stage === 'checkpoint' ? 'INSERT INTO media_timelines' : stage === 'receipt' ? 'INSERT INTO video_storyboard_applications' : 'INSERT INTO video_storyboard_timeline_obligations'
    await expect(transaction(db => applyStoryboardIn({ query: async (sql: string, params?: unknown[]) => {
      if (sql.includes(pattern)) throw new Error('Synthetic write failure')
      return db.query(sql, params)
    } } as unknown as Parameters<typeof applyStoryboardIn>[0], input, prepared))).rejects.toThrow('Synthetic write failure')
    expect(await counts(input.projectId)).toEqual({ timelines: 1, applications: 0, obligations: 0 })
    const current = await getProjectWithCurrentTimeline(input.projectId)
    expect(current!.timeline!.id).toBe(input.expectedTimelineId)
    expect(current!.timeline!.editRevision).toBe(0)
  })
  it('retains prior obligation lineage on the checkpoint during deliberate reapply', async () => {
    const input = await fixture()
    const first = await applyStoryboard(input)
    const second = await applyStoryboard({ ...input, operationId: randomUUID(), expectedTimelineId: first.after.timelineId, expectedEditRevision: first.after.editRevision })
    expect(second.checkpointTimelineId).toBe(first.after.timelineId)
    const rows = (await pool!.query('SELECT timeline_id, application_id FROM video_storyboard_timeline_obligations WHERE project_id=$1', [input.projectId])).rows
    expect(rows).toContainEqual({ timeline_id: first.after.timelineId, application_id: first.id })
    expect(rows).toContainEqual({ timeline_id: second.after.timelineId, application_id: second.id })
  })
  it('rejects revocation committed during preparation without creating a checkpoint', async () => {
    const input = await fixture()
    const prepared = await prepareStoryboardApplication(input)
    const saved = await getStoryboard(input.projectId, actor)
    await saveReferenceSet({ projectId: input.projectId, actor, operationId: randomUUID(), expectedRevision: saved.referenceSet!.id,
      references: saved.referenceSet!.references.map(ref => ({ role: ref.role, sourceKind: ref.sourceKind, assetId: ref.assetId, expectedContentHash: ref.contentHash, evidence: 'Synthetic revocation', decision: 'revoked' as const })), brandKit: null })
    await expect(transaction(db => applyStoryboardIn(db, input, prepared))).rejects.toMatchObject({ statusCode: 409 })
    expect(await counts(input.projectId)).toEqual({ timelines: 1, applications: 0, obligations: 0 })
  })
  it('holds the source row against a concurrent update until the application commits', async () => {
    const input = await fixture()
    const prepared = await prepareStoryboardApplication(input)
    const saved = await getStoryboard(input.projectId, actor)
    const assetId = saved.referenceSet!.references[0]!.assetId
    let release!: () => void
    let acquired!: () => void
    const held = new Promise<void>((resolve) => {
      acquired = resolve
    })
    const resume = new Promise<void>((resolve) => {
      release = resolve
    })
    const applying = transaction(db => applyStoryboardIn({ query: async (sql: string, params?: unknown[]) => {
      const result = await db.query(sql, params)
      if (sql.includes('FROM video_assets') && sql.includes('FOR SHARE')) {
        acquired()
        await resume
      }
      return result
    } } as unknown as Parameters<typeof applyStoryboardIn>[0], input, prepared))
    await held
    const writer = await pool!.connect()
    try {
      await writer.query('BEGIN')
      await writer.query('SET LOCAL lock_timeout=\'200ms\'')
      await expect(writer.query('UPDATE video_assets SET title=$1 WHERE id=$2', ['Changed synthetic title', assetId])).rejects.toMatchObject({ code: '55P03' })
      await writer.query('ROLLBACK')
    } finally {
      release()
      writer.release()
    }
    expect((await applying).after.editRevision).toBe(1)
    await pool!.query('UPDATE video_assets SET title=$1 WHERE id=$2', ['Changed synthetic title', assetId])
    expect(await counts(input.projectId)).toEqual({ timelines: 2, applications: 1, obligations: 1 })
  })
  it('rejects actor deactivation during preparation', async () => {
    const input = await fixture()
    const prepared = await prepareStoryboardApplication(input)
    await pool!.query('UPDATE team_members SET is_active=false WHERE id=$1', [actor.id])
    try {
      await expect(transaction(db => applyStoryboardIn(db, input, prepared))).rejects.toMatchObject({ statusCode: 403 })
      expect(await counts(input.projectId)).toEqual({ timelines: 1, applications: 0, obligations: 0 })
    } finally { await pool!.query('UPDATE team_members SET is_active=true WHERE id=$1', [actor.id]) }
  })
})
