import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createProject } from '~~/server/utils/audio/projects'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { getStoryboard, saveReferenceSet } from '~~/server/utils/video-storyboard/store'
import { createStoryboardPlan, acceptStoryboardCandidateIn } from '~~/server/utils/video-storyboard/candidates'
import type { StoryboardPlanningRequest } from '~~/server/utils/video-storyboard/planningRequest'
import { transaction } from '~~/server/utils/db'
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
async function fixture() {
  const created = await createProject({ createdBy: actor.id, clientId: null, title: 'Synthetic T04 candidate fixture', mediaType: 'av', initialState: emptyAvTimeline() })
  const projectId = created.project.id
  projects.push(projectId)
  const refs = await saveReferenceSet({ projectId, actor, expectedRevision: null, operationId: randomUUID(), references: [], brandKit: null })
  const plan = storyboardFixture()
  plan.shots.forEach((shot) => {
    shot.visual = { status: 'unresolved', reason: 'not_selected' }
  })
  const request: StoryboardPlanningRequest = { method: 'manual', operationId: randomUUID(), expectedRevision: null, expectedReferenceSetRevisionId: refs.id,
    inputMode: 'approved_script', durationSeconds: 30, targetFormat: 'reels_9x16', copy: { scriptSegments: plan.copy.scriptSegments, cues: plan.copy.cues }, assets: [], shots: plan.shots }
  return { projectId, actor, request }
}
function accept(input: Awaited<ReturnType<typeof fixture>>, candidate: Awaited<ReturnType<typeof createStoryboardPlan>>, operationId = randomUUID()) {
  return transaction(db => acceptStoryboardCandidateIn(db, { projectId: input.projectId, actor, operationId, expectedRevision: input.request.expectedRevision,
    candidateId: candidate.id, candidateHash: candidate.candidateHash, acceptChanges: true, approveCopy: true }))
}
describe.skipIf(!pool)('isolated storyboard planning', { timeout: 90000 }, () => {
  afterAll(async () => {
    for (const projectId of projects) await pool!.query('DELETE FROM media_projects WHERE id=$1', [projectId])
    await pool!.end()
  }, 30000)
  it('supports offline manual candidates, exact human approval, replay and new copy identity', async () => {
    const input = await fixture()
    const offline = vi.fn().mockRejectedValue(new Error('Provider unavailable'))
    const candidate = await createStoryboardPlan(input, { generate: offline })
    expect(offline).not.toHaveBeenCalled()
    expect((await getStoryboard(input.projectId, actor)).revision).toBeNull()
    const operation = randomUUID()
    const saved = await accept(input, candidate, operation)
    expect(saved.plan.copy.approval).toMatchObject({ actorId: actor.id, contentHash: candidate.plan.copy.contentHash })
    expect(saved.plan.copy.scriptSegments).toEqual(input.request.copy.scriptSegments)
    expect(saved.plan.copy.cues).toEqual(input.request.copy.cues)
    expect(await accept(input, candidate, operation)).toEqual(saved)
    expect(await createStoryboardPlan(input, { generate: offline })).toEqual(candidate)
    const next = { ...input, request: { ...input.request, expectedRevision: saved.id, operationId: randomUUID(), copy: { ...input.request.copy, cues: [{ ...input.request.copy.cues[0], text: 'New human offer' }] } } }
    const revised = await createStoryboardPlan(next, { generate: offline })
    expect(revised.plan.copy.id).not.toBe(saved.plan.copy.id)
    expect(revised.plan.copy.approval).toBeNull()
    expect((await getStoryboard(input.projectId, actor)).revision!.id).toBe(saved.id)
    await accept(next, revised)
    expect((await getStoryboard(input.projectId, actor, saved.id)).revision!.plan.copy.cues).toEqual(input.request.copy.cues)
    await expect(pool!.query('UPDATE video_storyboard_candidates SET result=\'{}\' WHERE id=$1', [candidate.id])).rejects.toMatchObject({ code: '55000' })
  })
  it('reserves before inference, rejects concurrent retries and terminally records failed plans', async () => {
    const fixtureInput = await fixture()
    const { shots: _shots, ...common } = fixtureInput.request as Extract<StoryboardPlanningRequest, { method: 'manual' }>
    const input = { ...fixtureInput, request: { ...common, method: 'ai' as const, brief: 'Make a simple edit' } }
    let dispatched!: () => void
    const started = new Promise<void>((resolve) => {
      dispatched = resolve
    })
    let finish!: (value: string) => void
    const response = new Promise<string>((resolve) => {
      finish = resolve
    })
    const generate = vi.fn(async () => {
      dispatched()
      return response
    })
    const first = createStoryboardPlan(input, { generate })
    await started
    await expect(createStoryboardPlan(input, { generate })).rejects.toMatchObject({ statusCode: 409 })
    finish(JSON.stringify({ shots: [{ purpose: 'close', durationFrames: 900, visual: null, spokenSegmentIds: ['intro', 'close'], copyCueIds: ['offer'] }] }))
    const candidate = await first
    expect(generate).toHaveBeenCalledTimes(1)
    expect(await createStoryboardPlan(input, { generate })).toEqual(candidate)
    const bad = { ...input, request: { ...input.request, operationId: randomUUID() } }
    const malformed = vi.fn().mockResolvedValue('{}')
    await expect(createStoryboardPlan(bad, { generate: malformed })).rejects.toMatchObject({ statusCode: 422 })
    expect(malformed).toHaveBeenCalledTimes(2)
    await expect(createStoryboardPlan(bad, { generate: malformed })).rejects.toMatchObject({ statusCode: 409 })
    expect((await getStoryboard(input.projectId, actor)).revision).toBeNull()
  })
  it('fences competing acceptance and project access', async () => {
    const input = await fixture()
    const first = await createStoryboardPlan(input)
    const other = await createStoryboardPlan({ ...input, request: { ...input.request, operationId: randomUUID() } })
    const race = await Promise.allSettled([accept(input, first), accept(input, other)])
    expect(race.filter(value => value.status === 'fulfilled')).toHaveLength(1)
    expect((race.find(value => value.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(409)
    await expect(createStoryboardPlan({ ...input, actor: { id: randomUUID(), role: 'member' } })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects acceptance after the project frame rate changes', async () => {
    const input = await fixture()
    const candidate = await createStoryboardPlan(input)
    await pool!.query('UPDATE media_timelines SET state=jsonb_set(state,\'{fps}\',\'60\'::jsonb) WHERE project_id=$1', [input.projectId])
    await expect(accept(input, candidate)).rejects.toMatchObject({ statusCode: 409 })
    expect((await getStoryboard(input.projectId, actor)).revision).toBeNull()
  })
})
