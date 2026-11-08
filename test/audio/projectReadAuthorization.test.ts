import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, unknown>
  params?: Record<string, string>
  headers?: Record<string, string>
  context?: Record<string, unknown>
}

const mockGetQuery = vi.fn()
const mockReadMultipart = vi.fn()
const mockSetResponseStatus = vi.fn()
const g = globalThis as unknown as Record<string, unknown>
g.defineEventHandler = (fn: unknown) => fn
g.getQuery = (...args: unknown[]) => mockGetQuery(...args)
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.getHeader = (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()]
g.setHeader = vi.fn()
g.setResponseStatus = (...args: unknown[]) => mockSetResponseStatus(...args)
g.sendStream = (_event: TestEvent, body: unknown) => body
g.readMultipartFormData = (...args: unknown[]) => mockReadMultipart(...args)
g.createError = (input: { statusCode: number, statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input)

let actor = { id: 'staff-1', role: 'staff' }
const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

const queryOneFreshMock = vi.fn()
const queryRowsMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  queryOneFresh: (...args: unknown[]) => queryOneFreshMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  queryRowsFresh: vi.fn(),
  transaction: vi.fn()
}))

const mockProjectCovers = vi.fn()
vi.mock('~~/server/utils/audio/projectCovers', () => ({
  projectCovers: (...args: unknown[]) => mockProjectCovers(...args)
}))

const mockExecuteUpload = vi.fn()
vi.mock('~~/server/utils/audio/godModeExternalMutations', () => ({
  executeGodModeMediaUpload: (...args: unknown[]) => mockExecuteUpload(...args)
}))

const mockReadStoredObject = vi.fn()
const mockUploadFile = vi.fn()
const mockGenerateStorageKey = vi.fn()
const mockIsStorageConfigured = vi.fn()
const mockValidateFileType = vi.fn()
const mockValidateFileSize = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  readStoredObject: (...args: unknown[]) => mockReadStoredObject(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getPresignedDownloadUrl: vi.fn(),
  getPublicUrl: vi.fn(),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  validateFileType: (...args: unknown[]) => mockValidateFileType(...args),
  validateFileSize: (...args: unknown[]) => mockValidateFileSize(...args),
  getMaxFileSize: vi.fn(() => 500 * 1024 * 1024)
}))

const { listProjects } = await import('~~/server/utils/audio/projects')
const { default: listHandler } = await import('../../server/api/agency/audio/projects/index.get')
const { default: detailHandler } = await import('../../server/api/agency/audio/projects/[id].get')
const { default: clipSourcesHandler } = await import('../../server/api/agency/audio/projects/[id]/clip-sources.get')
const { default: mediaHandler } = await import('../../server/api/agency/audio/projects/[id]/media.get')
const { default: uploadHandler } = await import('../../server/api/agency/audio/projects/[id]/upload-media.post')

const clientId = '11111111-1111-4111-8111-111111111111'
const projectRow = {
  id: 'p1',
  client_id: clientId,
  created_by: 'staff-1',
  title: 'Private project',
  media_type: 'av',
  is_test: false,
  status: 'draft',
  current_timeline_id: 't1',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z'
}
const timelineRow = {
  id: 't1',
  project_id: 'p1',
  version: 1,
  edit_revision: 0,
  label: null,
  state: {
    schema_version: 1,
    media_type: 'audio',
    sample_rate: 48000,
    duration_sec: 5,
    tracks: [{
      id: 'voice',
      name: 'Voice',
      kind: 'voiceover',
      clips: [{ id: 'clip', r2_key: 'private/audio.mp3', timeline_start_sec: 0, source_out_sec: 5 }]
    }],
    ducking: []
  },
  schema_version: 1,
  created_by: 'staff-1',
  created_at: '2026-11-01T00:00:00Z'
}

function useProject(createdBy = 'staff-1') {
  queryOneFreshMock
    .mockResolvedValueOnce({ ...projectRow, created_by: createdBy })
    .mockResolvedValueOnce(timelineRow)
}

const routeCases = [
  { name: 'project detail', handler: detailHandler, event: { params: { id: 'p1' } } },
  { name: 'clip sources', handler: clipSourcesHandler, event: { params: { id: 'p1' } } },
  { name: 'media proxy', handler: mediaHandler, event: { params: { id: 'p1' }, query: { key: 'private/audio.mp3' }, headers: {} } },
  { name: 'media upload', handler: uploadHandler, event: { params: { id: 'p1' }, context: {} } }
]

beforeEach(() => {
  vi.clearAllMocks()
  actor = { id: 'staff-1', role: 'staff' }
  mockRequireAuth.mockImplementation(async () => actor)
  mockRequireWriteAccess.mockImplementation(async () => actor)
  mockGetQuery.mockImplementation((event: TestEvent) => event.query ?? {})
  queryRowsMock.mockResolvedValue([])
  mockProjectCovers.mockResolvedValue(new Map())
  mockIsStorageConfigured.mockReturnValue(false)
  mockReadStoredObject.mockResolvedValue({
    body: new Blob(['audio']).stream(),
    contentType: 'audio/mpeg',
    size: 5,
    range: null,
    etag: null
  })
  mockReadMultipart.mockResolvedValue([
    { name: 'file', filename: 'movie.mp4', type: 'video/mp4', data: Buffer.from('video') },
    { name: 'kind', data: Buffer.from('footage') }
  ])
  mockValidateFileType.mockReturnValue(true)
  mockValidateFileSize.mockReturnValue(true)
  mockGenerateStorageKey.mockReturnValue('media-video/1-movie-00000000-0000-4000-8000-000000000001.mp4')
  mockExecuteUpload.mockImplementation(async (_event, mutate) => mutate({
    replay: false,
    replayResult: null,
    ids: ['00000000-0000-4000-8000-000000000002'],
    markDispatched: vi.fn()
  }))
})

describe('project list authorization', () => {
  it('filters staff projects by creator in SQL before the limit, including with a client filter', async () => {
    await listProjects(clientId, actor)
    const [sql, params] = queryRowsMock.mock.calls[0]
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT * FROM media_projects WHERE client_id = $1 AND created_by = $2 ORDER BY updated_at DESC LIMIT 200'
    )
    expect(params).toEqual([clientId, 'staff-1'])
  })

  it.each(['owner', 'admin'])('allows %s to list across creators without weakening the client filter', async (role) => {
    await listProjects(clientId, { id: 'privileged-user', role })
    const [sql, params] = queryRowsMock.mock.calls[0]
    expect(sql).toContain('WHERE client_id = $1')
    expect(sql).not.toContain('created_by')
    expect(params).toEqual([clientId])
  })

  it('uses the authenticated actor for both the public list query and cover enrichment', async () => {
    queryRowsMock.mockResolvedValue([projectRow])
    const cover = { url: '/cover', kind: 'image', label: 'Project preview' }
    mockProjectCovers.mockResolvedValue(new Map([['p1', cover]]))

    const result = await listHandler({ query: { clientId } } as never)

    const [sql, params] = queryRowsMock.mock.calls[0]
    expect(sql).toContain('client_id = $1 AND created_by = $2')
    expect(params).toEqual([clientId, actor.id])
    expect(mockProjectCovers).toHaveBeenCalledWith([expect.objectContaining({ id: 'p1' })], actor)
    expect(result).toEqual({ projects: [expect.objectContaining({ id: 'p1', cover })] })
  })
})

describe('project endpoint authorization', () => {
  it.each(routeCases)('allows the staff creator through $name', async ({ handler, event }) => {
    useProject(actor.id)
    await expect(handler(event as never)).resolves.toBeDefined()
  })

  it.each(['owner', 'admin'])('allows %s through every project endpoint', async (role) => {
    actor = { id: 'privileged-user', role }
    for (const { handler, event } of routeCases) {
      useProject('different-creator')
      await expect(handler(event as never)).resolves.toBeDefined()
    }
  })

  it.each(routeCases)('rejects a non-creator staff member through $name before storage side effects', async ({ handler, event }) => {
    actor = { id: 'different-staff', role: 'staff' }
    useProject('staff-1')

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockGetQuery).not.toHaveBeenCalled()
    expect(mockReadMultipart).not.toHaveBeenCalled()
    expect(mockReadStoredObject).not.toHaveBeenCalled()
    expect(mockIsStorageConfigured).not.toHaveBeenCalled()
    expect(mockGenerateStorageKey).not.toHaveBeenCalled()
    expect(mockExecuteUpload).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
})
