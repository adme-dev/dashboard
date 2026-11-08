import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { z } from 'zod'
import { ReferenceSetWriteSchema } from '~~/shared/video/storyboardReferences'
import { StoryboardPlanningRequestSchema, StoryboardAcceptRequestSchema } from '~~/server/utils/video-storyboard/planningRequest'
import { StoryboardTargetFormatSchema } from '~~/shared/video/storyboardRecipes'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProject, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { getStoryboard, saveReferenceSet } from '~~/server/utils/video-storyboard/store'
import { createStoryboardPlan, acceptStoryboardCandidateIn } from '~~/server/utils/video-storyboard/candidates'
import { StoryboardApplyRequestSchema, applyStoryboard, getStoryboardApplication, getLatestStoryboardApplication } from '~~/server/utils/video-storyboard/apply'
import { TimelineReviewRequestSchema, getTimelineReview, reviewAdjustedTimeline } from '~~/server/utils/video-storyboard/timelineReview'
import { resolveStoryboard } from '~~/server/utils/video-storyboard/resolve'
import { canonicalReferenceIn } from '~~/server/utils/video-storyboard/references'
import { compileStoryboard } from '~~/shared/video/storyboardCompile'
import { transaction } from '~~/server/utils/db'
import { storyboardFixture } from '../video/fixtures/storyboard'
import { runStoryboardPilotAcceptance } from '../../scripts/video-storyboard-pilot-acceptance.mjs'

const connectionString = process.env.STORYBOARD_TEST_DATABASE_URL
const host = process.env.STORYBOARD_TEST_DATABASE_HOST
if (connectionString) {
  const url = new URL(connectionString)
  const isolatedNeon = url.hostname === host && host === 'ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech'
  const isolatedLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/video_storyboard_recovery_test' && Boolean(url.port) && !url.search
  if (!isolatedNeon && !isolatedLocal) throw new Error('Only verified isolated Neon or explicit localhost video_storyboard_recovery_test is allowed')
}
const pool = connectionString ? new Pool({ connectionString, max: 6 }) : null
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows[0],
  queryOne: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows[0],
  queryRowsFresh: async (sql: string, params: unknown[]) => (await pool!.query(sql, params)).rows,
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
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: async () => ({ etag: 'fixture-etag', size: 128, contentType: 'image/png' }), getPresignedDownloadUrl: async () => {
  throw new Error('No media download permitted in this database fixture')
} }))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({ probeStoryboardMedia: async () => ({ kind: 'image', durationSeconds: null, width: 1080, height: 1920 }) }))
const actor = { id: randomUUID(), role: 'member' }
const roleId = randomUUID()
const assetId = randomUUID()
let projectId: string

// The adapter runs actual canonical services against disposable PostgreSQL. It is
// intentionally not a hosted HTTP/session or browser acceptance claim.
describe.skipIf(!pool)('nonpaid pilot runner against canonical PostgreSQL services', () => {
  beforeAll(async () => {
    await pool!.query(`INSERT INTO custom_roles (id, name, slug, is_read_only) VALUES ($1, 'Synthetic pilot role', $2, false)`, [roleId, `pilot-${roleId}`])
    await pool!.query(`INSERT INTO team_members (id, name, email, user_role, custom_role_id, is_active) VALUES ($1, 'Synthetic pilot actor', $2, 'member', $3, true)`, [actor.id, `${actor.id}@example.invalid`, roleId])
    const created = await createProject({ createdBy: actor.id, clientId: null, title: 'Owned disposable nonpaid pilot', mediaType: 'av', initialState: emptyAvTimeline() })
    projectId = created.project.id
    await pool!.query(`INSERT INTO video_assets (id, title, r2_key, format, created_by) VALUES ($1, 'Synthetic pilot still', 'synthetic/pilot.png', 'png', $2)`, [assetId, actor.id])
  })
  afterAll(async () => {
    if (projectId) {
      await pool!.query('DELETE FROM video_storyboards WHERE project_id=$1', [projectId])
      await pool!.query('DELETE FROM media_projects WHERE id=$1', [projectId])
    }
    await pool!.query('DELETE FROM video_assets WHERE id=$1', [assetId])
    await pool!.query('DELETE FROM team_members WHERE id=$1', [actor.id])
    await pool!.query('DELETE FROM custom_roles WHERE id=$1', [roleId])
    await pool!.end()
  })
  it('persists six shots, replays apply/review and resumes without another write', async () => {
    const identity = await transaction(db => canonicalReferenceIn(db, { id: projectId, clientId: null, createdBy: actor.id }, actor, 'video_asset', assetId))
    const shots = storyboardFixture().shots.map(shot => ({ ...shot, spokenSegmentIds: [], copyCueIds: [], visual: { status: 'bound', sourceKind: 'video_asset', assetId, contentHash: identity.contentHash } }))
    const config = {
      schemaVersion: 1, ownership: 'owned-disposable-nonpaid-t09', origin: 'https://owned.example.test', ownedHost: 'owned.example.test',
      projectId, actorId: actor.id, clientId: null, runId: randomUUID(), approveCopy: true, brandKit: null,
      references: [{ role: 'product', sourceKind: 'video_asset', assetId, expectedContentHash: identity.contentHash, decision: 'approved', evidence: 'Owned local synthetic fixture' }],
      plan: { inputMode: 'approved_script', durationSeconds: 30, targetFormat: 'reels_9x16', copy: { scriptSegments: [], cues: [] }, shots }
    }
    const root = `/api/agency/video/projects/${projectId}/storyboard`
    const calls: string[] = []
    const generate = vi.fn().mockRejectedValue(new Error('Provider calls forbidden'))
    type Request = { method: string, path: string, body?: unknown }
    const resolveRequest = z.object({ revisionId: z.string().uuid(), formats: z.array(StoryboardTargetFormatSchema) })
    async function dispatch({ method, path, body }: Request): Promise<unknown> {
      calls.push(`${method} ${path}`)
      if (method === 'GET' && path === `/api/agency/audio/projects/${projectId}`) return getProjectWithCurrentTimeline(projectId)
      if (method === 'GET' && path === root) return { ...await getStoryboard(projectId, actor), application: await getLatestStoryboardApplication({ projectId, actor }) }
      if (method === 'PUT' && path === `${root}/references`) return { referenceSet: await saveReferenceSet({ ...ReferenceSetWriteSchema.parse(body), projectId, actor }) }
      if (method === 'POST' && path === `${root}/plan`) return createStoryboardPlan({ projectId, actor, request: StoryboardPlanningRequestSchema.parse(body) }, { generate })
      if (method === 'POST' && path === `${root}/revisions`) return { revision: await transaction(db => acceptStoryboardCandidateIn(db, { ...StoryboardAcceptRequestSchema.parse(body), projectId, actor })) }
      if (method === 'POST' && path === `${root}/resolve`) return compileStoryboard(await resolveStoryboard({ ...resolveRequest.parse(body), projectId, actor }))
      if (method === 'POST' && path === `${root}/apply`) return applyStoryboard({ ...StoryboardApplyRequestSchema.parse(body), projectId, actor })
      if (method === 'GET' && path.startsWith(`${root}/applications/`)) return getStoryboardApplication({ actor, projectId, operationId: path.split('/').at(-1)! })
      if (method === 'GET' && path === `${root}/timeline-review`) return getTimelineReview({ projectId, actor })
      if (method === 'POST' && path === `${root}/timeline-review`) {
        const result = await reviewAdjustedTimeline({ ...TimelineReviewRequestSchema.parse(body), projectId, actor })
        return { ...result, id: result.review.id }
      }
      throw new Error('Unexpected pilot request')
    }
    const adapter = { actorId: actor.id, request: async (request: Request) => JSON.parse(JSON.stringify(await dispatch(request))) }
    const receipt = await runStoryboardPilotAcceptance({ config, adapter })
    expect(receipt.status).toBe('passed')
    expect(receipt.coverage.fullR1Accepted).toBe(false)
    expect(generate).not.toHaveBeenCalled()
    expect((await pool!.query('SELECT count(*)::int n FROM video_storyboard_applications WHERE project_id=$1', [projectId])).rows[0].n).toBe(1)
    calls.length = 0
    const resumed = await runStoryboardPilotAcceptance({ config, adapter, receipt })
    expect(resumed.operations).toEqual(receipt.operations)
    expect(calls.every(call => call.startsWith('GET '))).toBe(true)
  })
})
