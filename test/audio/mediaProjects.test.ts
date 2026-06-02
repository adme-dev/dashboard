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
