import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockEnsureArtifacts = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureArtifacts(...args)
}))

const { default: artifactsHandler } = await import(
  '../../../../server/api/portal/meetings/[id]/artifacts.get'
)

describe('portal meeting artifacts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockEnsureArtifacts.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue({ id: 'meeting-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'artifact-1',
        meeting_session_id: 'meeting-1',
        artifact_type: 'summary',
        title: 'Meeting summary',
        content: 'Reviewed campaign performance.',
        metadata: { source: 'ai' },
        created_by: 'team-1',
        created_at: '2026-05-28T00:00:00Z'
      }
    ])
  })

  it('returns client-scoped meeting artifacts for shared meetings', async () => {
    const result = await artifactsHandler({ params: { id: 'meeting-1' } })

    expect(mockEnsureArtifacts).not.toHaveBeenCalled()
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('om.client_user_id = $1'),
      ['client-user-1', 'meeting-1']
    )
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('artifact_type IN (\'summary\', \'action_items\', \'notes\', \'transcript\')')
    expect(result.artifacts).toEqual([
      {
        id: 'artifact-1',
        type: 'summary',
        title: 'Meeting summary',
        content: 'Reviewed campaign performance.',
        metadata: { source: 'ai' },
        createdAt: '2026-05-28T00:00:00Z'
      }
    ])
  })

  it('rejects meetings not shared with the client user', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(artifactsHandler({ params: { id: 'meeting-2' } })).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Meeting not found'
    })
  })
})
