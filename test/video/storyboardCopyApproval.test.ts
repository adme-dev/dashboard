import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveStoryboardRevisionIn } from '~~/server/utils/video-storyboard/store'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'
import { id, storyboardFixture } from './fixtures/storyboard'

const query = vi.fn()
const actor = { id: id(6), role: 'member' }
function input() {
  const plan = storyboardFixture()
  plan.copy.approval = null
  plan.copy.contentHash = storyboardHash({ scriptSegments: plan.copy.scriptSegments, cues: plan.copy.cues })
  plan.shots.forEach((shot) => {
    shot.visual = { status: 'unresolved', reason: 'not_selected' }
  })
  return { projectId: plan.projectId, actor, expectedRevision: null, operationId: id(90), plan, approveCopy: true, expectedCopyHash: plan.copy.contentHash }
}
beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM media_projects')) return { rows: [{ id: id(2), media_type: 'av', created_by: actor.id }] }
    if (sql.includes('FROM video_storyboards')) return { rows: [{ id: id(1), project_id: id(2), current_revision_id: null, current_reference_set_id: id(5) }] }
    if (sql.includes('FROM video_storyboard_reference_sets')) return { rows: [{ id: id(5), content_hash: 'b'.repeat(64) }] }
    if (sql.startsWith('INSERT INTO video_storyboard_revisions')) return { rows: [{ id: params[0], project_id: params[1], reference_set_id: params[3], plan: JSON.parse(params[4] as string) }] }
    return { rows: [] }
  })
})
describe('explicit human copy approval', () => {
  it('stamps only the reviewed hash with server actor/time inside the revision transaction', async () => {
    const request = input()
    const result = await saveStoryboardRevisionIn({ query }, request)
    expect(result.plan.copy.approval).toMatchObject({ actorId: actor.id, contentHash: request.expectedCopyHash })
    expect(result.plan.copy.approval!.approvedAt).toMatch(/^\d{4}-/)
    expect(request.plan.copy.approval).toBeNull()
  })
  it('rejects stale reviewed hashes and cannot approve by supplying an actor', async () => {
    const request = input()
    await expect(saveStoryboardRevisionIn({ query }, { ...request, expectedCopyHash: 'c'.repeat(64) })).rejects.toMatchObject({ statusCode: 409 })
    request.plan.copy.approval = { actorId: id(99), contentHash: request.plan.copy.contentHash, approvedAt: '2026-11-05T00:00:00Z' }
    await expect(saveStoryboardRevisionIn({ query }, { ...request, approveCopy: false })).rejects.toMatchObject({ statusCode: 400 })
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false)
  })
})
