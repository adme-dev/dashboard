import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyStoryboardIn, getStoryboardApplicationIn } from '~~/server/utils/video-storyboard/apply'
import { id, storyboardFixture } from './fixtures/storyboard'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { storyboardHash } from '~~/server/utils/video-storyboard/hash'

const mocks = vi.hoisted(() => ({ project: vi.fn(), saved: vi.fn(), resolve: vi.fn(), current: vi.fn(), replace: vi.fn(), compile: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: mocks.project }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboardIn: mocks.saved }))
vi.mock('~~/server/utils/video-storyboard/resolve', () => ({ resolveStoryboardIn: mocks.resolve }))
vi.mock('~~/server/utils/audio/projects', () => ({ getCurrentTimelineIfMatchingIn: mocks.current, replaceTimelineWithCheckpointIn: mocks.replace }))
vi.mock('~~/shared/video/storyboardCompile', () => ({ compileStoryboard: mocks.compile }))
const input = { actor: { id: id(6), role: 'member' }, projectId: id(2), operationId: id(30), revisionId: id(3), expectedTimelineId: id(40), expectedEditRevision: 2, replaceConfirmed: true }
const requestHash = () => storyboardHash({ ...input, actor: undefined, actorId: input.actor.id })
const query = vi.fn()
const receipt = { id: id(31), operationId: id(30), after: { timelineId: id(41), editRevision: 3 } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: id(2) })
  mocks.saved.mockResolvedValue({ storyboard: { currentRevisionId: id(3), currentReferenceSetId: id(5) }, revision: { plan: storyboardFixture(), referenceSetId: id(5), sourceHash: 'b'.repeat(64) }, referenceSet: { references: [], brandKit: null } })
  mocks.current.mockResolvedValue({ id: id(40), editRevision: 2, state: { ...emptyAvTimeline(), tracks: [{ id: 'old', name: 'Old', kind: 'video', clips: [{ id: 'old', type: 'video', r2_key: 'old.mp4', timeline_start_sec: 0, duration_sec: 1, base_source: 'uploaded_footage' }] }] } })
  mocks.resolve.mockResolvedValue({ plan: storyboardFixture() })
  mocks.compile.mockReturnValue({ ok: true, timeline: { tracks: [] }, obligations: { sources: [], cues: [] } })
  mocks.replace.mockResolvedValue({ checkpoint: { id: id(40), version: 1 }, timeline: { id: id(41), editRevision: 3, state: emptyAvTimeline() } })
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM team_members') ? [{ user_role: 'member', custom_role_id: id(50) }] : sql.includes('FROM custom_roles') ? [{ id: id(50), is_read_only: false }] : [] }))
})
const prepared = () => ({ measurements: new Map(), revisionId: id(3), resolvedHash: storyboardHash({ plan: storyboardFixture() }) })
describe('atomic storyboard application', () => {
  it('replays the original receipt before checking later timeline or source changes', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ request_hash: requestHash(), receipt }] })
    expect(await applyStoryboardIn({ query }, input, prepared())).toEqual(receipt)
    expect(mocks.saved).not.toHaveBeenCalled()
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it('rejects operation fingerprint conflicts', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ request_hash: 'other', receipt }] })
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toMatchObject({ statusCode: 409 })
  })
  it('reauthorizes recovery, which does not need current source eligibility', async () => {
    query.mockResolvedValueOnce({ rows: [{ receipt }] })
    expect(await getStoryboardApplicationIn({ query }, input)).toEqual(receipt)
    mocks.project.mockRejectedValue({ statusCode: 403 })
    await expect(getStoryboardApplicationIn({ query }, input)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['inactive', 'demoted', 'readonly'])('rejects %s write authority refreshed after preparation', async (change) => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM team_members')
      ? change === 'inactive' ? [] : [{ user_role: change === 'demoted' ? 'viewer' : 'member', custom_role_id: id(50) }]
      : sql.includes('FROM custom_roles') ? [{ id: id(50), is_read_only: change === 'readonly' }] : [] }))
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('rejects stale plans before checkpoint creation', async () => {
    const saved = await mocks.saved()
    saved.storyboard.currentRevisionId = id(99)
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('rejects replacement without explicit confirmation', async () => {
    await expect(applyStoryboardIn({ query }, { ...input, replaceConfirmed: false }, prepared())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('rejects stale timeline preconditions', async () => {
    mocks.current.mockRejectedValue({ statusCode: 409 })
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('blocks inaccessible/unready dependencies without any timeline write', async () => {
    mocks.compile.mockReturnValue({ ok: false, findings: [{ code: 'source_unavailable' }] })
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('writes a canonical receipt and obligations in the caller transaction', async () => {
    const result = await applyStoryboardIn({ query }, input, prepared())
    expect(result).toMatchObject({ operationId: input.operationId, before: { timelineId: id(40), editRevision: 2 }, after: { timelineId: id(41), editRevision: 3 }, checkpointTimelineId: id(40) })
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO video_storyboard_applications'))).toBe(true)
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO video_storyboard_timeline_obligations'))).toBe(true)
  })
  it('propagates checkpoint failures before writing receipts', async () => {
    mocks.replace.mockRejectedValue(new Error('checkpoint failure'))
    await expect(applyStoryboardIn({ query }, input, prepared())).rejects.toThrow('checkpoint failure')
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO video_storyboard_applications'))).toBe(false)
  })
})
