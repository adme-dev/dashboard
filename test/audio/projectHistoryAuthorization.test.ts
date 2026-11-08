import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
  body?: unknown
}

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

const queryOneFreshMock = vi.fn()
const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const queryRowsFreshMock = vi.fn()
const transactionMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => queryOneFreshMock(...args),
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  queryRowsFresh: (...args: unknown[]) => queryRowsFreshMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...args)
}))

const projectRow = {
  id: 'p1',
  client_id: null,
  created_by: 'creator',
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
  state: {},
  schema_version: 2,
  created_by: 'creator',
  created_at: '2026-11-01T00:00:00Z'
}
const renderJobRow = {
  id: 'j1',
  timeline_id: 't1',
  project_id: 'p1',
  channels: ['mp4'],
  status: 'done',
  variants: { mp4: 'private/p1/j1.mp4' },
  requested_by: 'creator'
}

let projectPresent = true
const dbQueryMock = vi.fn(async (sql: string, _params: unknown[] = []) => {
  const statement = sql.replace(/\s+/g, ' ').trim()
  if (statement === 'SELECT * FROM media_projects WHERE id = $1 FOR UPDATE' || statement === 'SELECT * FROM media_projects WHERE id = $1') {
    return { rows: projectPresent ? [projectRow] : [] }
  }
  if (statement === 'SELECT * FROM media_timelines WHERE id = $1') return { rows: [timelineRow] }
  if (statement.startsWith('UPDATE media_projects SET')) return { rows: [projectRow] }
  return { rows: [] }
})
const stubDb = { query: dbQueryMock }
let replayReference: string | null = null
vi.mock('~~/server/utils/audio/godModeMutations', () => {
  const passthrough = async (
    _event: unknown,
    mutate: (db: unknown) => Promise<unknown>,
    replay: (db: unknown, reference: string) => Promise<unknown>
  ) => replayReference ? replay(stubDb, replayReference) : mutate(stubDb)
  return {
    executeGodModeMediaProjectUpdate: passthrough,
    executeGodModeMediaProjectDelete: passthrough
  }
})

const mockGetPresignedDownloadUrl = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockIsStorageConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args)
}))

const mockSendRedirect = vi.fn()
const g = globalThis as unknown as Record<string, unknown>
g.defineEventHandler = (handler: unknown) => handler
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.readBody = async (event: TestEvent) => event.body ?? {}
g.createError = (input: { statusCode: number, statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input)
g.sendRedirect = (...args: unknown[]) => mockSendRedirect(...args)

const { default: renderJobsHandler } = await import('../../server/api/agency/audio/projects/[id]/render-jobs.get')
const { default: versionsHandler } = await import('../../server/api/agency/audio/projects/[id]/versions.get')
const { default: renderVariantHandler } = await import('../../server/api/agency/audio/projects/[id]/renders/[jobId]/[format].get')
const { default: patchHandler } = await import('../../server/api/agency/audio/projects/[id]/index.patch')
const { default: deleteHandler } = await import('../../server/api/agency/audio/projects/[id]/index.delete')

let actor = { id: 'creator', role: 'staff' }
const readCases = [
  { name: 'render job history', handler: renderJobsHandler, event: { params: { id: 'p1' } } },
  { name: 'version history', handler: versionsHandler, event: { params: { id: 'p1' } } },
  { name: 'signed render URL', handler: renderVariantHandler, event: { params: { id: 'p1', jobId: 'j1', format: 'mp4' } } }
]
const mutationCases = [
  { name: 'rename', handler: patchHandler, event: { params: { id: 'p1' }, body: { title: 'Renamed' } } },
  { name: 'delete', handler: deleteHandler, event: { params: { id: 'p1' } } }
]
const allowedActors = [
  { label: 'creator', value: { id: 'creator', role: 'staff' } },
  { label: 'owner', value: { id: 'owner', role: 'owner' } },
  { label: 'admin', value: { id: 'admin', role: 'admin' } }
]

beforeEach(() => {
  vi.clearAllMocks()
  actor = { id: 'creator', role: 'staff' }
  projectPresent = true
  replayReference = null
  mockRequireAuth.mockImplementation(async () => actor)
  mockRequireWriteAccess.mockImplementation(async () => actor)
  queryOneFreshMock.mockImplementation(async (sql: string) => sql.includes('media_render_jobs') ? renderJobRow : projectRow)
  queryRowsFreshMock.mockResolvedValue([])
  queryOneMock.mockResolvedValue(renderJobRow)
  queryRowsMock.mockResolvedValue([])
  mockIsStorageConfigured.mockReturnValue(true)
  mockGetPublicUrl.mockReturnValue(null)
  mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example.com/j1.mp4')
  mockSendRedirect.mockImplementation(async (_event, url) => url)
})

describe('project history read authorization', () => {
  it.each(readCases)('rejects another staff member reading $name before its query or storage effects', async ({ handler, event }) => {
    actor = { id: 'other-staff', role: 'staff' }

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(queryRowsMock).not.toHaveBeenCalled()
    expect(queryRowsFreshMock).not.toHaveBeenCalled()
    expect(queryOneMock).not.toHaveBeenCalled()
    expect(dbQueryMock).not.toHaveBeenCalled()
    expect(mockIsStorageConfigured).not.toHaveBeenCalled()
    expect(mockGetPublicUrl).not.toHaveBeenCalled()
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  it.each(allowedActors)('allows the $label to read history and obtain a signed render URL', async ({ value }) => {
    actor = value

    for (const { handler, event } of readCases) {
      await expect(handler(event as never)).resolves.toBeDefined()
    }

    expect(queryRowsMock).toHaveBeenCalledTimes(1)
    expect(queryRowsFreshMock).toHaveBeenCalledTimes(1)
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith('private/p1/j1.mp4', 3600)
    expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://signed.example.com/j1.mp4', 302)
  })
})

describe('project mutation authorization', () => {
  it.each(mutationCases)('rejects another staff member attempting to $name without any write', async ({ handler, event }) => {
    actor = { id: 'other-staff', role: 'staff' }

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(dbQueryMock).toHaveBeenCalledTimes(1)
    expect(dbQueryMock).toHaveBeenCalledWith('SELECT * FROM media_projects WHERE id = $1 FOR UPDATE', ['p1'])
    expect(dbQueryMock.mock.calls.some(([sql]) => /^\s*(UPDATE|DELETE)/i.test(sql))).toBe(false)
  })

  it.each(allowedActors)('allows the $label to rename and delete under the project lock', async ({ value }) => {
    actor = value

    await expect(patchHandler(mutationCases[0].event as never)).resolves.toBeDefined()
    await expect(deleteHandler(mutationCases[1].event as never)).resolves.toEqual({ success: true, id: 'p1' })

    const statements = dbQueryMock.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim())
    expect(statements).toEqual([
      'SELECT * FROM media_projects WHERE id = $1 FOR UPDATE',
      'UPDATE media_projects SET updated_at = now(), title = $2 WHERE id = $1 RETURNING *',
      'SELECT * FROM media_projects WHERE id = $1 FOR UPDATE',
      'DELETE FROM media_render_jobs WHERE project_id = $1',
      'DELETE FROM media_projects WHERE id = $1'
    ])
  })

  it.each(mutationCases)('reauthorizes a $name replay while the project still exists', async ({ handler, event }) => {
    actor = { id: 'other-staff', role: 'staff' }
    replayReference = 'p1'

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(dbQueryMock).toHaveBeenCalledWith('SELECT * FROM media_projects WHERE id = $1', ['p1'])
    expect(dbQueryMock.mock.calls.some(([sql]) => /^\s*(UPDATE|DELETE)/i.test(sql))).toBe(false)
  })

  it('keeps delete replay idempotent after the project is gone', async () => {
    actor = { id: 'other-staff', role: 'staff' }
    projectPresent = false
    replayReference = 'p1'

    await expect(deleteHandler(mutationCases[1].event as never)).resolves.toEqual({ success: true, id: 'p1' })
    expect(dbQueryMock.mock.calls.some(([sql]) => /^\s*(UPDATE|DELETE)/i.test(sql))).toBe(false)
  })
})
