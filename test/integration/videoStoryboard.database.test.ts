import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createProject } from '~~/server/utils/audio/projects'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { getStoryboard, saveReferenceSet, saveStoryboardRevision, resolveReferenceSet } from '~~/server/utils/video-storyboard/store'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'
import { storyboardFixture } from '../video/fixtures/storyboard'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
const host = process.env.STORYBOARD_TEST_DATABASE_HOST
if (connectionString && (new URL(connectionString).hostname !== host || host !== 'ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech')) throw new Error('Only the verified isolated storyboard branch is allowed')
const pool = connectionString ? new Pool({ connectionString, max: 4 }) : null
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(),
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
// SQL is real. Synthetic media uses a stub HEAD; this suite never uploads media.
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: async () => ({ etag: 'fixture-etag', size: 128, contentType: 'image/png' }) }))
const actor = { id: randomUUID(), role: 'member' }
const projects: string[] = []
const sources: string[] = []
async function fixture() {
  const created = await createProject({ createdBy: actor.id, clientId: null, title: 'Synthetic T03 storyboard fixture', mediaType: 'av', initialState: emptyAvTimeline() })
  const projectId = created.project.id
  projects.push(projectId)
  const referenceSet = await saveReferenceSet({ projectId, actor, expectedRevision: null, operationId: randomUUID(), references: [], brandKit: null })
  const root = await getStoryboard(projectId, actor)
  const plan = storyboardFixture()
  plan.id = root.storyboard!.id
  plan.projectId = projectId
  plan.revision = randomUUID()
  plan.inputMode = 'idea'
  plan.copy.id = randomUUID()
  plan.copyRevisionId = plan.copy.id
  plan.copy.approval = null
  plan.copy.contentHash = storyboardHash({ scriptSegments: plan.copy.scriptSegments, cues: plan.copy.cues })
  plan.referenceSetRevisionId = referenceSet.id
  for (const shot of plan.shots) shot.visual = { status: 'unresolved', reason: 'not_selected' }
  return { projectId, actor, expectedRevision: null, operationId: randomUUID(), plan, referenceSet }
}

describe.skipIf(!pool)('isolated storyboard persistence', { timeout: 45000 }, () => {
  afterAll(async () => {
    for (const projectId of projects) await pool!.query('DELETE FROM media_projects WHERE id=$1', [projectId])
    for (const sourceId of sources) await pool!.query('DELETE FROM video_gen_source_assets WHERE id=$1', [sourceId])
    await pool!.end()
  }, 30000)

  it('two writers at the same pointer commit exactly one immutable revision', async () => {
    const input = await fixture()
    const results = await Promise.allSettled([
      saveStoryboardRevision(input),
      saveStoryboardRevision({ ...input, operationId: randomUUID(), plan: { ...input.plan, revision: randomUUID() } })
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(409)
    const rows = (await pool!.query('SELECT sequence FROM video_storyboard_revisions WHERE project_id=$1', [input.projectId])).rows
    expect(rows).toEqual([{ sequence: 1 }])
  })

  it('replays a staff operation after a later save and rejects a changed body with the same key', async () => {
    const input = await fixture()
    const first = await saveStoryboardRevision(input)
    const second = await saveStoryboardRevision({ ...input, expectedRevision: first.id, operationId: randomUUID(), plan: { ...input.plan, revision: randomUUID() } })
    expect(await saveStoryboardRevision(input)).toEqual(first)
    await expect(saveStoryboardRevision({ ...input, plan: { ...input.plan, revision: randomUUID() } })).rejects.toMatchObject({ statusCode: 409 })
    expect((await getStoryboard(input.projectId, actor)).revision!.id).toBe(second.id)
    expect((await getStoryboard(input.projectId, actor, first.id)).revision!.id).toBe(first.id)
  })

  it('reference writes replay identically and fence competing reference pointers', async () => {
    const input = await fixture()
    const write = { projectId: input.projectId, actor, expectedRevision: input.referenceSet.id, operationId: randomUUID(), references: [], brandKit: null }
    const first = await saveReferenceSet(write)
    expect(await saveReferenceSet(write)).toEqual(first)
    const next = { ...write, operationId: randomUUID(), expectedRevision: first.id }
    const results = await Promise.allSettled([saveReferenceSet(next), saveReferenceSet({ ...next, operationId: randomUUID() })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(409)
    await expect(saveReferenceSet({ ...write, expectedRevision: first.id })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keeps old reference decisions inspectable but blocks them after revocation', async () => {
    const input = await fixture()
    const sourceId = randomUUID()
    sources.push(sourceId)
    await pool!.query('INSERT INTO video_gen_source_assets (id,client_id,created_by,r2_key,content_type,status,subject_type) VALUES ($1,NULL,$2,$3,\'image/png\',\'approved\',\'vehicle\')', [sourceId, actor.id, `fixture/${sourceId}.png`])
    const selection = { role: 'product' as const, sourceKind: 'source_asset' as const, assetId: sourceId, expectedContentHash: null, decision: 'unreviewed' as const, evidence: '' }
    const pending = await saveReferenceSet({ projectId: input.projectId, actor, expectedRevision: input.referenceSet.id, operationId: randomUUID(), references: [selection], brandKit: null })
    const approved = await saveReferenceSet({ projectId: input.projectId, actor, expectedRevision: pending.id, operationId: randomUUID(), references: [{ ...selection, expectedContentHash: pending.references[0].contentHash, decision: 'approved', evidence: 'Synthetic usage permission' }], brandKit: null })
    const revision = await saveStoryboardRevision({ ...input, plan: { ...input.plan, referenceSetRevisionId: approved.id } })
    expect((await resolveReferenceSet({ projectId: input.projectId, actor, revisionId: revision.id }))!.eligible).toBe(true)
    const revoked = await saveReferenceSet({ projectId: input.projectId, actor, expectedRevision: approved.id, operationId: randomUUID(), references: [{ ...selection, expectedContentHash: pending.references[0].contentHash, decision: 'revoked' }], brandKit: null })
    const historical = await getStoryboard(input.projectId, actor, revision.id)
    expect(historical.referenceSet!.references[0].approval!.actorId).toBe(actor.id)
    expect((await getStoryboard(input.projectId, actor)).referenceSet!.id).toBe(revoked.id)
    expect((await resolveReferenceSet({ projectId: input.projectId, actor, revisionId: revision.id }))!.findings.map(f => f.code)).toContain('reference_set_superseded')
    expect((await pool!.query('SELECT status FROM video_gen_source_assets WHERE id=$1', [sourceId])).rows[0].status).toBe('approved')
  })

  it('enforces immutable rows, cross-project history isolation and canonical copy hashes', async () => {
    const input = await fixture()
    const saved = await saveStoryboardRevision(input)
    await expect(pool!.query('UPDATE video_storyboard_revisions SET sequence=2 WHERE id=$1', [saved.id])).rejects.toMatchObject({ code: '55000' })
    await expect(getStoryboard(input.projectId, { id: randomUUID(), role: 'member' }, saved.id)).rejects.toMatchObject({ statusCode: 403 })
    const other = await fixture()
    await expect(getStoryboard(other.projectId, actor, saved.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(pool!.query('UPDATE video_storyboards SET current_revision_id=$1 WHERE project_id=$2', [saved.id, other.projectId])).rejects.toMatchObject({ code: '23503' })
    await expect(saveStoryboardRevision({ ...input, expectedRevision: saved.id, operationId: randomUUID(), plan: { ...input.plan, revision: randomUUID(), copy: { ...input.plan.copy, contentHash: '0'.repeat(64) } } })).rejects.toMatchObject({ statusCode: 400 })
  })
})
