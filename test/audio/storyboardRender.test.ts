import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { saveDraftTimelineIfCurrentIn, createVersionIn, createRenderJobIn } from '~~/server/utils/audio/projects'

vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(), transaction: vi.fn() }))
const actor = { id: 'u', role: 'member' }
const state = emptyAvTimeline()
const project = { id: 'p', created_by: 'u', status: 'draft', current_timeline_id: 't' }
const timeline = { id: 't', project_id: 'p', state, schema_version: 2, version: 1, edit_revision: 2, created_by: 'u' }
const contract = { revisionId: 'r', copyRevisionId: 'c', copyHash: 'h', sources: [], cues: [{ clipId: 'deleted', required: true, text: 'Never remove', shotId: 's', copyId: 'x', cueId: 'cue', startFrame: 0, durationFrames: 30 }] }
const query = vi.fn()
beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM media_projects WHERE')) return { rows: [project] }
    if (sql.includes('SELECT * FROM media_timelines')) return { rows: [timeline] }
    if (sql.includes('SELECT EXISTS')) return { rows: [{ exists: false }] }
    if (sql.includes('UPDATE media_timelines')) return { rows: [{ ...timeline, edit_revision: 3 }] }
    if (sql.includes('SELECT MAX')) return { rows: [{ max_version: 1 }] }
    if (sql.includes('INSERT INTO media_timelines')) return { rows: [{ ...timeline, id: 'next', edit_revision: 0 }] }
    if (sql.includes('INSERT INTO media_render_jobs')) return { rows: [{ id: 'job', timeline_id: 'next', project_id: 'p' }] }
    if (sql.includes('FROM video_storyboard_timeline_obligations')) return { rows: [{ application_id: 'a', contract, review_state: {}, receipt: { afterState: state } }] }
    return { rows: [] }
  })
})
describe('ordinary timeline mutation preserves server obligations', () => {
  it.each([['save', saveDraftTimelineIfCurrentIn], ['version', createVersionIn], ['render', createRenderJobIn]] as const)('%s carries obligations even when all clips and metadata were removed', async (_name, action) => {
    await action({ query }, { projectId: 'p', actor, expectedTimelineId: 't', expectedEditRevision: 2, state, channels: [] })
    const inserted = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO video_storyboard_timeline_obligations'))
    expect(inserted).toBeDefined()
    expect(JSON.parse(inserted![1][4])).toEqual(contract)
    expect(JSON.parse(inserted![1][6]).status).toBe('needs_review')
  })
  it('legacy timelines remain unobligated', async () => {
    const previous = query.getMockImplementation()!
    query.mockImplementation((sql, args) => sql.includes('FROM video_storyboard_timeline_obligations') ? Promise.resolve({ rows: [] }) : previous(sql, args))
    await saveDraftTimelineIfCurrentIn({ query }, { projectId: 'p', actor, expectedTimelineId: 't', expectedEditRevision: 2, state })
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO video_storyboard_timeline_obligations'))).toBe(false)
  })
})
