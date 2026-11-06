import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { saveDraftTimelineIfCurrentIn, createVersionIn, createRenderJobIn, getCurrentTimelineIfMatchingIn } from '~~/server/utils/audio/projects'

vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(), transaction: vi.fn() }))

const actor = { id: 'u1', role: 'member' }
const token = { expectedTimelineId: 't1', expectedEditRevision: 0 }
const state = emptyAvTimeline()
const project = { id: 'p1', created_by: 'u1', status: 'draft', current_timeline_id: 't1' }
const timeline = { id: 't1', project_id: 'p1', state, schema_version: 1, version: 1, edit_revision: 0, created_by: 'u1' }
const query = vi.fn()
const db = { query }
beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }))

function lockedRows(overrides = {}) {
  query.mockResolvedValueOnce({ rows: [{ ...project, ...overrides }] })
  query.mockResolvedValueOnce({ rows: [timeline] })
}

describe('revision-checked timeline persistence', () => {
  it('saves only the pinned current draft and returns its incremented revision', async () => {
    lockedRows()
    query.mockResolvedValueOnce({ rows: [{ exists: false }] })
    query.mockResolvedValueOnce({ rows: [{ ...timeline, edit_revision: 1 }] })
    const saved = await saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, ...token, state })
    expect(saved.editRevision).toBe(1)
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(query.mock.calls[3][0]).toContain('edit_revision = edit_revision + 1')
  })

  it.each([
    { expectedTimelineId: 't1' },
    { expectedTimelineId: 't1', expectedEditRevision: -1 },
    { expectedTimelineId: 't1', expectedEditRevision: '0' }
  ])('rejects missing/invalid preconditions before any DB mutation %j', async (precondition) => {
    await expect(saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, state, ...precondition } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a stale revision without writing', async () => {
    lockedRows()
    await expect(saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, ...token, expectedEditRevision: 2, state })).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('rejects a changed active pointer without writing the former draft', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...project, current_timeline_id: 't2' }] })
    await expect(saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, ...token, state })).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('enforces project ownership under the lock', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...project, created_by: 'another-user' }] })
    await expect(saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, ...token, state })).rejects.toMatchObject({ statusCode: 403 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('rejects a non-draft project under the lock', async () => {
    lockedRows({ status: 'approved' })
    await expect(saveDraftTimelineIfCurrentIn(db, { projectId: 'p1', actor, ...token, state })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('versions check revision and retain the source schema version', async () => {
    query.mockResolvedValueOnce({ rows: [project] })
    query.mockResolvedValueOnce({ rows: [{ ...timeline, schema_version: 2 }] })
    query.mockResolvedValueOnce({ rows: [{ max_version: 4 }] })
    query.mockResolvedValueOnce({ rows: [{ ...timeline, id: 't5', version: 5, schema_version: 2 }] })
    query.mockResolvedValueOnce({ rows: [] })
    const saved = await createVersionIn(db, { projectId: 'p1', actor, ...token, label: 'Reviewed cut' })
    expect(saved.schemaVersion).toBe(2)
    expect(saved.id).toBe('t5')
    expect(query.mock.calls[3][1][5]).toBe(2)
  })

  it('stale versions and renders create no snapshot or job', async () => {
    for (const create of [createVersionIn, createRenderJobIn]) {
      query.mockReset()
      lockedRows()
      await expect(create(db, { projectId: 'p1', actor, ...token, expectedEditRevision: 1, channels: [] })).rejects.toMatchObject({ statusCode: 409 })
      expect(query).toHaveBeenCalledTimes(2)
    }
  })

  it('render snapshots do not replace the editable draft pointer', async () => {
    lockedRows()
    query.mockResolvedValueOnce({ rows: [{ max_version: 1 }] })
    query.mockResolvedValueOnce({ rows: [{ ...timeline, id: 'render-snapshot' }] })
    query.mockResolvedValueOnce({ rows: [{ id: 'job', project_id: 'p1', timeline_id: 'render-snapshot' }] })
    const job = await createRenderJobIn(db, { projectId: 'p1', actor, ...token, channels: [] })
    expect(job.timelineId).toBe('render-snapshot')
    expect(query.mock.calls.some(([sql]) => /UPDATE media_projects/.test(sql))).toBe(false)
  })
  it('replays only the exact current receipt revision, including forked row IDs', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...project, current_timeline_id: 'forked' }] })
    query.mockResolvedValueOnce({ rows: [{ ...timeline, id: 'forked', edit_revision: 1 }] })
    expect(await getCurrentTimelineIfMatchingIn(db, { projectId: 'p1', actor, expectedTimelineId: 'forked', expectedEditRevision: 1 })).toMatchObject({ id: 'forked', editRevision: 1 })
    query.mockReset()
    lockedRows()
    await expect(getCurrentTimelineIfMatchingIn(db, { projectId: 'p1', actor, ...token, expectedEditRevision: 1 })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a replay after its active pointer changed', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...project, current_timeline_id: 't2' }] })
    await expect(getCurrentTimelineIfMatchingIn(db, { projectId: 'p1', actor, ...token })).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
  })
})
