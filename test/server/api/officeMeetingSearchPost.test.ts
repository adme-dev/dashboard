import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: { LLAMA_70B: 'llama-3.3-70b-versatile' },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/search.post'
)

function fakeEvent(body: Record<string, unknown> = {}) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings/search', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockGenerateGroqInsight.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockGenerateGroqInsight.mockResolvedValue('Budget confirmation came up in the client review [1].')
  })

  it('answers across recent meeting artifacts', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'artifact-1',
        meeting_session_id: 'meeting-1',
        meeting_title: 'Client review',
        meeting_status: 'ended',
        zone_name: 'Meeting Room A',
        title: 'Client review summary',
        artifact_type: 'summary',
        content: 'Budget confirmation came up in the client review.',
        created_at: '2026-05-27T00:00:00.000Z'
      }
    ])

    const result = await handler(fakeEvent({ question: 'Where did budget come up?' }))

    expect(result).toEqual({
      answer: 'Budget confirmation came up in the client review [1].',
      sources: [{
        id: 'artifact-1',
        meeting_id: 'meeting-1',
        meeting_title: 'Client review',
        title: 'Client review summary',
        artifact_type: 'summary',
        excerpt: 'Budget confirmation came up in the client review.'
      }]
    })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('JOIN office_meeting_sessions')
    expect(String(mockGenerateGroqInsight.mock.calls[0]?.[0])).toContain('Question: Where did budget come up?')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(
      expect.stringContaining('Question: Where did budget come up?'),
      expect.objectContaining({
        model: 'llama-3.3-70b-versatile',
        featureKey: 'office_meeting_cross_search',
        userId: 'user-1',
        requestId: 'office-1',
        metadata: {
          route: 'officeMeetingSearch',
          officeId: 'office-1',
          artifactCount: 1,
          sourceCount: 1,
          questionChars: 25,
        },
      }),
    )
  })

  it('requires office membership', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ question: 'What changed?' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })

  it('requires searchable meeting artifacts', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'member-1', role: 'member' })
    mockQueryRows.mockResolvedValueOnce([])

    await expect(handler(fakeEvent({ question: 'What changed?' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'No meeting artifacts are available to search yet'
    })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })
})
