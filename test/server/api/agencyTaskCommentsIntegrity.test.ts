import { beforeEach, describe, expect, it, vi } from 'vitest'

const TASK_ID = '11111111-1111-4111-8111-111111111111'
const COMMENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const EDITED_AT = '2026-07-18T08:00:00.000Z'

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockReadBody = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: unknown, name: string) => string | undefined
  getQuery: (event: unknown) => Record<string, string>
  readBody: <T>(event: unknown) => Promise<T>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (_event, name) => {
  if (name === 'id') return TASK_ID
  if (name === 'commentId') return COMMENT_ID
  return undefined
}
testGlobal.getQuery = () => ({})
testGlobal.readBody = (...args: unknown[]) => mockReadBody(...args)
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  notifyMention: vi.fn().mockResolvedValue(undefined),
  notifyTaskComment: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~~/server/utils/subscriptions', () => ({
  autoSubscribeIfEnabled: vi.fn().mockResolvedValue(undefined)
}))

const { default: listCommentsHandler } = await import(
  '../../../../server/api/agency/tasks/[id]/comments.get'
)
const { default: createCommentHandler } = await import(
  '../../../../server/api/agency/tasks/[id]/comments.post'
)
const { default: updateCommentHandler } = await import(
  '../../../../server/api/agency/tasks/[id]/comments/[commentId].put'
)

describe('agency task comment integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
  })

  it('reads the schema-backed edited timestamp', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: TASK_ID })
      .mockResolvedValueOnce({ total: '1' })
    mockQueryRows.mockResolvedValueOnce([{
      id: COMMENT_ID,
      task_id: TASK_ID,
      content: 'Production evidence',
      created_at: '2026-07-18T07:00:00.000Z',
      edited_at: EDITED_AT,
      user_id: ACTOR_ID,
      user_name: 'Paul',
      user_email: 'paul@example.com',
      user_avatar: null
    }])

    const result = await listCommentsHandler({} as never)
    const commentsSql = String(mockQueryRows.mock.calls[0]?.[0])

    expect(mockRequireAuth).toHaveBeenCalledOnce()
    expect(commentsSql).toContain('ta.edited_at')
    expect(commentsSql).not.toContain('ta.updated_at')
    expect(result.comments[0]).toMatchObject({ updatedAt: EDITED_AT })
  })

  it('derives the comment actor from the authenticated session', async () => {
    mockReadBody.mockResolvedValue({
      content: 'Controlled pilot evidence',
      userId: 'spoofed-actor-id'
    })
    mockQueryOne
      .mockResolvedValueOnce({
        id: TASK_ID,
        title: 'T16 — Controlled pilot and staged rollout',
        assignee_id: null,
        reporter_id: null,
        department_id: 'board-1'
      })
      .mockResolvedValueOnce({
        id: COMMENT_ID,
        task_id: TASK_ID,
        content: 'Controlled pilot evidence',
        created_at: '2026-07-18T07:00:00.000Z'
      })
      .mockResolvedValueOnce({ id: ACTOR_ID, name: 'Paul', email: 'paul@example.com' })

    await createCommentHandler({} as never)

    expect(mockRequireAuth).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO task_activities'),
      [TASK_ID, ACTOR_ID, 'Controlled pilot evidence']
    )
  })

  it('rejects an unauthenticated comment before reading or writing task data', async () => {
    const authError = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    mockRequireAuth.mockRejectedValueOnce(authError)

    await expect(createCommentHandler({} as never)).rejects.toBe(authError)

    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('records edits using edited_at instead of a nonexistent updated_at column', async () => {
    mockReadBody.mockResolvedValue({ content: 'Corrected evidence' })
    mockQueryOne
      .mockResolvedValueOnce({ id: COMMENT_ID, user_id: ACTOR_ID })
      .mockResolvedValueOnce({ id: COMMENT_ID, content: 'Corrected evidence', edited_at: EDITED_AT })
      .mockResolvedValueOnce({ id: ACTOR_ID, name: 'Paul', email: 'paul@example.com', avatar_url: null })

    const result = await updateCommentHandler({} as never)
    const updateSql = String(mockQueryOne.mock.calls[1]?.[0])

    expect(updateSql).toContain('edited_at = NOW()')
    expect(updateSql).toContain('RETURNING id, content, edited_at')
    expect(updateSql).not.toContain('updated_at')
    expect(result.updatedAt).toBe(EDITED_AT)
  })
})
