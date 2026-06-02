import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB so the gateway can be unit-tested without a connection.
const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const transactionMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: any[]) => queryOneMock(...a),
  queryRows: (...a: any[]) => queryRowsMock(...a),
  transaction: (cb: any) => transactionMock(cb)
}))

import {
  mapProjectRow,
  mapTimelineRow,
  createProject,
  getProjectWithCurrentTimeline,
  listProjects,
  saveDraftTimeline,
  createVersion,
  listVersions
} from '~~/server/utils/audio/projects'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const projectRow = {
  id: 'p1', client_id: 'c1', created_by: 'u1', title: 'Promo', media_type: 'audio',
  status: 'draft', current_timeline_id: 't1',
  created_at: '2026-06-02T00:00:00Z', updated_at: '2026-06-02T00:00:00Z'
}
const timelineRow = {
  id: 't1', project_id: 'p1', version: 1, label: null,
  state: { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, tracks: [], ducking: [] },
  schema_version: 1, created_by: 'u1', created_at: '2026-06-02T00:00:00Z'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mapProjectRow', () => {
  it('maps snake_case to camelCase', () => {
    const p = mapProjectRow(projectRow)
    expect(p.id).toBe('p1')
    expect(p.clientId).toBe('c1')
    expect(p.createdBy).toBe('u1')
    expect(p.mediaType).toBe('audio')
    expect(p.currentTimelineId).toBe('t1')
  })
  it('null client_id maps to null', () => {
    expect(mapProjectRow({ ...projectRow, client_id: null }).clientId).toBeNull()
  })
})

describe('mapTimelineRow', () => {
  it('maps and exposes state + version', () => {
    const t = mapTimelineRow(timelineRow)
    expect(t.id).toBe('t1')
    expect(t.projectId).toBe('p1')
    expect(t.version).toBe(1)
    expect(t.schemaVersion).toBe(1)
    expect((t.state as any).sample_rate).toBe(48000)
  })
})

describe('createProject', () => {
  it('inserts a project + v1 timeline and points current_timeline_id at it (in a transaction)', async () => {
    // Fake transaction client: returns the project row, then the timeline row, then the update.
    const dbQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [projectRow] })             // INSERT project
      .mockResolvedValueOnce({ rows: [timelineRow] })            // INSERT v1 timeline
      .mockResolvedValueOnce({ rows: [{ ...projectRow, current_timeline_id: 't1' }] }) // UPDATE project
    transactionMock.mockImplementation(async (cb: any) => cb({ query: dbQuery }))

    const initialState: TimelineState = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000,
      duration_sec: 0, tracks: [], ducking: []
    }
    const { project, timeline } = await createProject({
      createdBy: 'u1', clientId: 'c1', title: 'Promo', initialState
    })
    expect(project.currentTimelineId).toBe('t1')
    expect(timeline.version).toBe(1)
    expect(dbQuery).toHaveBeenCalledTimes(3)
  })
})

describe('getProjectWithCurrentTimeline', () => {
  it('returns null when the project does not exist', async () => {
    queryOneMock.mockResolvedValueOnce(null)
    expect(await getProjectWithCurrentTimeline('nope')).toBeNull()
  })
  it('returns the project and its current timeline', async () => {
    queryOneMock
      .mockResolvedValueOnce(projectRow)   // project
      .mockResolvedValueOnce(timelineRow)  // current timeline
    const res = await getProjectWithCurrentTimeline('p1')
    expect(res?.project.id).toBe('p1')
    expect(res?.timeline?.id).toBe('t1')
  })
})

describe('listProjects', () => {
  it('lists all projects with no filter', async () => {
    queryRowsMock.mockResolvedValueOnce([projectRow])
    const rows = await listProjects()
    expect(rows).toHaveLength(1)
    expect(queryRowsMock.mock.calls[0][1]).toEqual([]) // no params
  })
  it('filters by clientId', async () => {
    queryRowsMock.mockResolvedValueOnce([projectRow])
    await listProjects('c1')
    expect(queryRowsMock.mock.calls[0][0]).toContain('client_id = $1')
    expect(queryRowsMock.mock.calls[0][1]).toEqual(['c1'])
  })
})

describe('saveDraftTimeline', () => {
  it('overwrites the draft row state and stamps duration_sec from computeDuration', async () => {
    const state: TimelineState = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
      tracks: [{ id: 't', name: 'M', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false,
        clips: [{ id: 'c', asset_id: null, r2_key: 'k', timeline_start_sec: 0, source_in_sec: 0,
          source_out_sec: 8, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }] }],
      ducking: []
    }
    queryOneMock.mockResolvedValueOnce({ ...timelineRow, state: { ...state, duration_sec: 8 } })
    const saved = await saveDraftTimeline('t1', state)
    // duration was recomputed to 8 and embedded in the persisted state arg
    const persistedState = JSON.parse(queryOneMock.mock.calls[0][1][0])
    expect(persistedState.duration_sec).toBe(8)
    expect((saved.state as any).duration_sec).toBe(8)
  })
})

describe('createVersion', () => {
  it('snapshots current state into version max+1 and repoints current_timeline_id', async () => {
    const dbQuery = vi.fn()
      // SELECT current timeline (state to copy) + max version
      .mockResolvedValueOnce({ rows: [{ state: timelineRow.state, max_version: 1 }] })
      // INSERT new version row (version 2)
      .mockResolvedValueOnce({ rows: [{ ...timelineRow, id: 't2', version: 2 }] })
      // UPDATE project.current_timeline_id
      .mockResolvedValueOnce({ rows: [] })
    transactionMock.mockImplementation(async (cb: any) => cb({ query: dbQuery }))

    const v = await createVersion({ projectId: 'p1', createdBy: 'u1', label: 'v2' })
    expect(v.version).toBe(2)
    expect(v.id).toBe('t2')
    expect(dbQuery).toHaveBeenCalledTimes(3)
  })
})

describe('listVersions', () => {
  it('returns versions newest-first', async () => {
    queryRowsMock.mockResolvedValueOnce([{ ...timelineRow, version: 2, id: 't2' }, timelineRow])
    const rows = await listVersions('p1')
    expect(rows.map(r => r.version)).toEqual([2, 1])
    expect(queryRowsMock.mock.calls[0][0]).toContain('ORDER BY version DESC')
  })
})
