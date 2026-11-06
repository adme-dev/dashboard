import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any }
const token = { expectedTimelineId: 't1', expectedEditRevision: 0 }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number; statusMessage: string; data?: any }) =>
  Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a)
}))

const mockListProjects = vi.fn()
const mockCreateProject = vi.fn()
const mockGetProject = vi.fn()
const mockSaveDraft = vi.fn()
const mockRestoreVersion = vi.fn()
const mockCreateVersion = vi.fn()
const mockListVersions = vi.fn()
const mockReplayTimeline = vi.fn()
let replayReference: string | null = null
// The handlers now run their DB core under the God mode coordinator, which for
// ordinary staff is a plain transaction(). Mock the coordinator to hand the
// mutate callback a stub db, and mock the `…In(db, …)` cores to drop the db arg
// so the assertions below stay on the domain inputs.
const stubDb = { query: vi.fn() }
vi.mock('~~/server/utils/audio/godModeMutations', () => {
  const passthrough = async (_event: unknown, mutate: (db: unknown) => Promise<unknown>, replay: (db: unknown, reference: string) => Promise<unknown>) => replayReference ? replay(stubDb, replayReference) : mutate(stubDb)
  return {
    executeGodModeMediaProjectCreate: passthrough,
    executeGodModeMediaProjectDelete: passthrough,
    executeGodModeMediaTimelineSave: passthrough,
    executeGodModeMediaVersionCreate: passthrough
  }
})
vi.mock('~~/server/utils/audio/projects', async original => ({
  ...await original<typeof import('~~/server/utils/audio/projects')>(),
  listProjects: (...a: unknown[]) => mockListProjects(...a),
  createProjectIn: (_db: unknown, ...a: unknown[]) => mockCreateProject(...a),
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  getProjectWithCurrentTimelineIn: vi.fn(),
  getCurrentTimelineIfMatchingIn: (_db: unknown, ...a: unknown[]) => mockReplayTimeline(...a),
  restoreTimelineVersionIn: (_db: unknown, ...a: unknown[]) => mockRestoreVersion(...a),
  saveDraftTimelineIfCurrentIn: (_db: unknown, ...a: unknown[]) => mockSaveDraft(...a),
  createVersionIn: (_db: unknown, ...a: unknown[]) => mockCreateVersion(...a),
  listVersions: (...a: unknown[]) => mockListVersions(...a)
}))

const { default: listH } = await import('../../server/api/agency/audio/projects/index.get')
const { default: createH } = await import('../../server/api/agency/audio/projects/index.post')
const { default: getH } = await import('../../server/api/agency/audio/projects/[id].get')
const { default: putH } = await import('../../server/api/agency/audio/projects/[id]/timeline.put')
const { default: versionPostH } = await import('../../server/api/agency/audio/projects/[id]/versions.post')
const { default: versionGetH } = await import('../../server/api/agency/audio/projects/[id]/versions.get')

beforeEach(() => {
  vi.clearAllMocks()
  replayReference = null
  mockRequireAuth.mockResolvedValue({ id: 'u1', role: 'member' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1', role: 'member' })
})

describe('GET /agency/audio/projects', () => {
  it('lists projects, passing the clientId filter through', async () => {
    mockListProjects.mockResolvedValue([{ id: 'p1' }])
    const res = await listH({ query: { clientId: '11111111-1111-4111-8111-111111111111' } } as any)
    expect(res).toEqual({ projects: [{ id: 'p1', cover: null }] })
    expect(mockListProjects).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })
  it('lists all projects when no filter', async () => {
    mockListProjects.mockResolvedValue([])
    await listH({ query: {} } as any)
    expect(mockListProjects).toHaveBeenCalledWith(undefined)
  })
})

describe('POST /agency/audio/projects', () => {
  it('creates a project with a normalized initial timeline', async () => {
    mockCreateProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1' }, timeline: { id: 't1', version: 1 } })
    const res = await createH({ body: { title: 'Promo', clientId: null } } as any)
    expect(res.project.id).toBe('p1')
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    const arg = mockCreateProject.mock.calls[0][0]
    expect(arg.createdBy).toBe('u1')
    expect(arg.initialState.schema_version).toBe(1)
    expect(arg.initialState.tracks).toEqual([])
  })
  it('400s when the provided initial timeline fails validation', async () => {
    const badState = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
      tracks: [{ id: 't', name: 'A', kind: 'music', clips: [] }],
      ducking: [{ id: 'd', source_track_id: 't', target_track_id: 'missing', amount_db: -6 }]
    }
    await expect(createH({ body: { initialState: badState } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateProject).not.toHaveBeenCalled()
  })
})

const goodState = {
  schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
  tracks: [{ id: 't', name: 'M', kind: 'music', clips: [
    { id: 'c', r2_key: 'k', timeline_start_sec: 0, source_out_sec: 8 }
  ] }],
  ducking: []
}

describe('GET /agency/audio/projects/:id', () => {
  it('404s when the project is missing', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(getH({ params: { id: 'nope' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('returns the project + current timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1' }, timeline: { id: 't1' } })
    const res = await getH({ params: { id: 'p1' } } as any)
    expect(res.project.id).toBe('p1')
    expect(res.timeline.id).toBe('t1')
  })
})

describe('PUT /agency/audio/projects/:id/timeline (autosave)', () => {
  it('404s when the project is missing', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(putH({ params: { id: 'p1' }, body: { ...token, state: goodState } } as never))
      .rejects.toMatchObject({ statusCode: 404 })
  })
  it('409s when the project is not in draft status', async () => {
    mockGetProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1', status: 'approved', currentTimelineId: 't1' }, timeline: { id: 't1' } })
    await expect(putH({ params: { id: 'p1' }, body: { ...token, state: goodState } } as never))
      .rejects.toMatchObject({ statusCode: 409 })
  })
  it('400s on an invalid timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1', status: 'draft', currentTimelineId: 't1' }, timeline: { id: 't1' } })
    const bad = { ...goodState, ducking: [{ id: 'd', source_track_id: 't', target_track_id: 'missing', amount_db: -6 }] }
    await expect(putH({ params: { id: 'p1' }, body: { ...token, state: bad } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })
  it('saves the draft timeline on a valid body', async () => {
    mockGetProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1', status: 'draft', currentTimelineId: 't1' }, timeline: { id: 't1' } })
    mockSaveDraft.mockResolvedValue({ id: 't1', version: 1, state: goodState })
    const res = await putH({ params: { id: 'p1' }, body: { ...token, state: goodState } } as never)
    expect(mockSaveDraft).toHaveBeenCalled()
    expect(mockSaveDraft.mock.calls[0][0]).toMatchObject({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, ...token }) // saves the current timeline id
    expect(res.timeline.id).toBe('t1')
  })
})

describe('POST /agency/audio/projects/:id/versions (duplicate-to-version)', () => {
  it('creates a new version', async () => {
    mockCreateVersion.mockResolvedValue({ id: 't2', version: 2 })
    const res = await versionPostH({ params: { id: 'p1' }, body: { ...token, label: 'v2' } } as never)
    expect(res.timeline.version).toBe(2)
    expect(mockCreateVersion).toHaveBeenCalledWith({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, ...token, label: 'v2' })
    expect(mockRequireWriteAccess).toHaveBeenCalled()
  })
})

describe('GET /agency/audio/projects/:id/versions', () => {
  it('returns version history', async () => {
    mockListVersions.mockResolvedValue([{ version: 2 }, { version: 1 }])
    const res = await versionGetH({ params: { id: 'p1' } } as any)
    expect(res.versions.map((v: any) => v.version)).toEqual([2, 1])
  })
})

describe('POST /agency/audio/projects (AV)', () => {
  it('creates an AV project, passing mediaType through and seeding an AV timeline', async () => {
    mockCreateProject.mockResolvedValue({ project: { id: 'p9', media_type: 'av' }, timeline: { id: 't9' } })
    const res = await createH({ body: { title: 'Vid', mediaType: 'av' } } as any)
    expect(mockCreateProject).toHaveBeenCalledTimes(1)
    const arg = mockCreateProject.mock.calls[0][0]
    expect(arg.mediaType).toBe('av')
    expect(arg.initialState.media_type).toBe('av')
    expect(arg.initialState.tracks.map((t: any) => t.kind)).toContain('video')
    expect(res.project.id).toBe('p9')
  })
})

describe('timeline revision route guards', () => {
  it.each([putH, versionPostH])('requires preconditions before any mutation', async (handler) => {
    await expect(handler({ params: { id: 'p1' }, body: { state: goodState } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })

  it('denies a different project owner before saving', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', createdBy: 'someone-else', status: 'draft', currentTimelineId: 't1' } })
    await expect(putH({ params: { id: 'p1' }, body: { ...token, state: goodState } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('pins a save replay to the receipt ID and resulting revision', async () => {
    replayReference = 'forked'
    mockGetProject.mockResolvedValue({ project: { id: 'p1', createdBy: 'u1', status: 'draft', currentTimelineId: 'forked' } })
    mockReplayTimeline.mockResolvedValue({ id: 'forked', editRevision: 5 })
    await putH({ params: { id: 'p1' }, body: { ...token, expectedEditRevision: 4, state: goodState } } as never)
    expect(mockReplayTimeline).toHaveBeenCalledWith({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, expectedTimelineId: 'forked', expectedEditRevision: 5 })
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('pins a version replay to revision zero of its receipt ID', async () => {
    replayReference = 't2'
    mockReplayTimeline.mockRejectedValue({ statusCode: 409 })
    await expect(versionPostH({ params: { id: 'p1' }, body: token } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockReplayTimeline).toHaveBeenCalledWith({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, expectedTimelineId: 't2', expectedEditRevision: 0 })
    expect(mockCreateVersion).not.toHaveBeenCalled()
  })
})


describe('authoritative version restore request', () => {
  const restoreTimelineId = '00000000-0000-4000-8000-000000000001'
  beforeEach(() => mockGetProject.mockResolvedValue({ project: { createdBy: 'u1', id: 'p1', status: 'draft', currentTimelineId: 't1' }, timeline: { id: 't1' } }))
  it('accepts an identity-only restore and never passes client state to the restoring core', async () => {
    mockRestoreVersion.mockResolvedValue({ id: 'restored', editRevision: 1 })
    const result = await putH({ params: { id: 'p1' }, body: { ...token, restoreTimelineId } } as never)
    expect(result.timeline.id).toBe('restored')
    expect(mockRestoreVersion).toHaveBeenCalledWith({ projectId: 'p1', actor: { id: 'u1', role: 'member' }, ...token, restoreTimelineId })
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })
  it.each([{}, { state: goodState, restoreTimelineId }, { restoreTimelineId: 'invalid' }])('rejects missing, conflicting or invalid restore state %j', async body => {
    await expect(putH({ params: { id: 'p1' }, body: { ...token, ...body } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRestoreVersion).not.toHaveBeenCalled()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })
})
