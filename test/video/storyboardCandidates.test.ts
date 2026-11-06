import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reserveStoryboardCandidateIn, acceptStoryboardCandidateIn, assertPlanningContextIn } from '~~/server/utils/video-storyboard/candidates'
import { id, storyboardFixture } from './fixtures/storyboard'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'

const save = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/video-storyboard/store', async original => ({ ...await original<typeof import('~~/server/utils/video-storyboard/store')>(), saveStoryboardRevisionIn: save }))
const actor = { id: id(6), role: 'member' }
const query = vi.fn()
const request = { method: 'ai' as const, operationId: id(30), expectedRevision: null, expectedReferenceSetRevisionId: id(5), brief: 'An edit', inputMode: 'idea' as const, durationSeconds: 30, targetFormat: 'reels_9x16' as const, assets: [], copy: { scriptSegments: [], cues: [] } }
beforeEach(() => vi.resetAllMocks())
describe('durable candidate boundaries', () => {
  it('returns the identical completed result before checking changed pointers', async () => {
    const result = { id: id(30), candidateHash: 'a'.repeat(64), plan: {} }
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: actor.id, media_type: 'av' }] })
    query.mockResolvedValueOnce({ rows: [{ status: 'completed', result, request_hash: storyboardHash({ projectId: id(2), actorId: actor.id, request }) }] })
    expect(await reserveStoryboardCandidateIn({ query }, { projectId: id(2), actor, request })).toEqual({ result })
    expect(query).toHaveBeenCalledTimes(2)
  })
  it.each(['pending', 'failed'])('does not redispatch %s operation', async (status) => {
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: actor.id, media_type: 'av' }] })
    query.mockResolvedValueOnce({ rows: [{ status, request_hash: storyboardHash({ projectId: id(2), actorId: actor.id, request }) }] })
    await expect(reserveStoryboardCandidateIn({ query }, { projectId: id(2), actor, request })).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(2)
  })
  it('rejects changed request bodies under the same operation', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: actor.id, media_type: 'av' }] })
    query.mockResolvedValueOnce({ rows: [{ status: 'completed', request_hash: 'different' }] })
    await expect(reserveStoryboardCandidateIn({ query }, { projectId: id(2), actor, request })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('does not save a revision for an unreviewed candidate hash', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: actor.id, media_type: 'av' }] })
    query.mockResolvedValueOnce({ rows: [{ status: 'completed', result: { candidateHash: 'b'.repeat(64), plan: storyboardFixture() } }] })
    await expect(acceptStoryboardCandidateIn({ query }, { projectId: id(2), actor, candidateId: id(30), candidateHash: 'a'.repeat(64), expectedRevision: null, operationId: id(31), acceptChanges: true, approveCopy: false })).rejects.toMatchObject({ statusCode: 409 })
    expect(save).not.toHaveBeenCalled()
  })
  it('rejects a changed active draft before publishing a generated candidate', async () => {
    query.mockResolvedValueOnce({ rows: [{ current_revision_id: id(99), current_reference_set_id: id(5) }] })
    await expect(assertPlanningContextIn({ query }, { projectId: id(2), actor, request }, { referenceSetId: id(5) } as never)).rejects.toMatchObject({ statusCode: 409 })
  })
})
