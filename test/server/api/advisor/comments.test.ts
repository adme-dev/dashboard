/**
 * Slice 4: tests for the recommendation_comments endpoints.
 * Covers POST add, PATCH edit (author + admin override), DELETE soft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryOne = vi.fn()
const mockQuery = vi.fn()
const mockGetSelectedTenant = vi.fn(async () => 'tenant-123')
const mockRequireAuth = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))
const mockRequireWriteAccess = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))
const mockHasRole = vi.fn(() => false)

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  query: (...args: any[]) => mockQuery(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: any[]) => mockRequireWriteAccess(...args),
  hasRole: (...args: any[]) => mockHasRole(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => Promise.resolve(event?.body ?? {})
;(globalThis as any).getRouterParam = (event: any, name: string) => event?.context?.params?.[name]
;(globalThis as any).createError = (opts: { statusCode: number; statusMessage: string }) => {
  const e = new Error(opts.statusMessage) as any
  e.statusCode = opts.statusCode
  e.statusMessage = opts.statusMessage
  return e
}

vi.mock('h3', () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    const e = new Error(opts.statusMessage) as any
    e.statusCode = opts.statusCode
    e.statusMessage = opts.statusMessage
    return e
  },
}))

const { default: addHandler } = await import(
  '../../../../server/api/advisor/recommendations/[id]/comments/index.post'
)
const { default: editHandler } = await import(
  '../../../../server/api/advisor/recommendations/[id]/comments/[commentId].patch'
)
const { default: deleteHandler } = await import(
  '../../../../server/api/advisor/recommendations/[id]/comments/[commentId].delete'
)

function recParams(id: string, commentId?: string) {
  return { context: { params: { id, ...(commentId ? { commentId } : {}) } } }
}

describe('POST /api/advisor/recommendations/:id/comments', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQuery.mockReset()
    mockHasRole.mockReturnValue(false)
    // First queryOne = rec lookup, second = INSERT, third = decorated SELECT.
    let callCount = 0
    mockQueryOne.mockImplementation(() => {
      callCount += 1
      if (callCount === 1) return Promise.resolve({ id: 'rec-1' })
      if (callCount === 2) return Promise.resolve({ id: 'comment-1', body: 'hello' })
      return Promise.resolve({
        id: 'comment-1',
        recommendation_id: 'rec-1',
        author_id: 'user-1',
        body: 'hello',
        author_name: 'Paul',
        author_avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    })
    mockQuery.mockResolvedValue([])
  })

  it('adds a comment and returns the decorated row', async () => {
    const res = await addHandler({
      ...recParams('rec-1'),
      body: { body: 'hello' },
    } as any)
    expect(res.comment.id).toBe('comment-1')
    expect(res.comment.author_name).toBe('Paul')
  })

  it('rejects empty body with 400', async () => {
    await expect(
      addHandler({ ...recParams('rec-1'), body: { body: '   ' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects unknown recommendation with 404', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(
      addHandler({ ...recParams('rec-missing'), body: { body: 'hi' } } as any)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('emits a commented audit event', async () => {
    await addHandler({ ...recParams('rec-1'), body: { body: 'hello' } } as any)
    const eventCall = mockQuery.mock.calls.find((c) =>
      c[0].includes('INSERT INTO recommendation_events')
    )
    expect(eventCall).toBeTruthy()
    expect(eventCall![0]).toContain("'commented'")
  })
})

describe('PATCH /api/advisor/recommendations/:id/comments/:commentId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQuery.mockReset()
    mockHasRole.mockReturnValue(false)
    mockQuery.mockResolvedValue([])
  })

  it('lets the author edit their own comment', async () => {
    let n = 0
    mockQueryOne.mockImplementation(() => {
      n += 1
      // 1: existing lookup, 2: UPDATE returning, 3: decorated select
      if (n === 1) return Promise.resolve({ id: 'comment-1', author_id: 'user-1', deleted_at: null })
      if (n === 2) return Promise.resolve({ id: 'comment-1' })
      return Promise.resolve({ id: 'comment-1', body: 'edited', author_name: 'Paul' })
    })

    const res = await editHandler({
      ...recParams('rec-1', 'comment-1'),
      body: { body: 'edited' },
    } as any)
    expect(res.comment.body).toBe('edited')
  })

  it('rejects edits from non-author non-admin with 403', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'comment-1', author_id: 'someone-else', deleted_at: null })
    mockHasRole.mockReturnValue(false)
    await expect(
      editHandler({ ...recParams('rec-1', 'comment-1'), body: { body: 'sneaky' } } as any)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets owner/admin edit any comment (override)', async () => {
    let n = 0
    mockQueryOne.mockImplementation(() => {
      n += 1
      if (n === 1) return Promise.resolve({ id: 'comment-1', author_id: 'someone-else', deleted_at: null })
      if (n === 2) return Promise.resolve({ id: 'comment-1' })
      return Promise.resolve({ id: 'comment-1', body: 'admin-fixed' })
    })
    mockHasRole.mockReturnValue(true)

    const res = await editHandler({
      ...recParams('rec-1', 'comment-1'),
      body: { body: 'admin-fixed' },
    } as any)
    expect(res.comment.body).toBe('admin-fixed')
  })

  it('returns 404 when the comment is already soft-deleted', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'comment-1',
      author_id: 'user-1',
      deleted_at: '2026-01-01T00:00:00Z',
    })
    await expect(
      editHandler({ ...recParams('rec-1', 'comment-1'), body: { body: 'x' } } as any)
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('DELETE /api/advisor/recommendations/:id/comments/:commentId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQuery.mockReset()
    mockHasRole.mockReturnValue(false)
    mockQuery.mockResolvedValue([])
  })

  it('soft-deletes when author calls', async () => {
    let n = 0
    mockQueryOne.mockImplementation(() => {
      n += 1
      if (n === 1) return Promise.resolve({ id: 'comment-1', author_id: 'user-1', deleted_at: null })
      return Promise.resolve({ id: 'comment-1' })
    })

    const res = await deleteHandler({ ...recParams('rec-1', 'comment-1') } as any)
    expect(res.ok).toBe(true)
    const updateCall = mockQueryOne.mock.calls.find((c) =>
      c[0].includes('SET deleted_at = NOW()')
    )
    expect(updateCall).toBeTruthy()
  })

  it('rejects delete from non-author non-admin with 403', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'comment-1', author_id: 'someone-else', deleted_at: null })
    mockHasRole.mockReturnValue(false)
    await expect(
      deleteHandler({ ...recParams('rec-1', 'comment-1') } as any)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('emits comment_deleted audit event', async () => {
    let n = 0
    mockQueryOne.mockImplementation(() => {
      n += 1
      if (n === 1) return Promise.resolve({ id: 'comment-1', author_id: 'user-1', deleted_at: null })
      return Promise.resolve({ id: 'comment-1' })
    })
    await deleteHandler({ ...recParams('rec-1', 'comment-1') } as any)
    const eventCall = mockQuery.mock.calls.find((c) =>
      c[0].includes('INSERT INTO recommendation_events')
    )
    expect(eventCall![0]).toContain("'comment_deleted'")
  })
})
