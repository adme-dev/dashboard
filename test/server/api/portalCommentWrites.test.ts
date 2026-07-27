import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => mockQueryOne(...args),
  execute: vi.fn()
}))

const { default: commentWriteHandler } = await import(
  '../../../../server/api/portal/comments/index.post'
)

describe('portal comment writes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canAddComments: true, canViewProjects: true, canApproveWork: true }
    })
  })

  it('rejects a write containing both project and approval scopes', async () => {
    await expect(commentWriteHandler({
      body: {
        content: 'Comment',
        projectId: 'project-1',
        approvalId: 'approval-1'
      }
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Exactly one comment scope is required'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('requires the project to be client-owned and comment-visible', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'project-1' })
      .mockResolvedValueOnce({ id: 'comment-1', content: 'Comment', created_at: 'now' })

    await commentWriteHandler({
      body: { content: 'Comment', projectId: 'project-1' }
    })

    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('show_comments')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual(['project-1', 'client-1'])
  })

  it('rejects a parent comment outside the selected scope', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'project-1' })
      .mockResolvedValueOnce(null)

    await expect(commentWriteHandler({
      body: {
        content: 'Reply',
        projectId: 'project-1',
        parentCommentId: 'comment-from-another-project'
      }
    })).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Parent comment not found'
    })

    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('parent_comment_id')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      'comment-from-another-project',
      'project-1',
      null
    ])
    expect(mockQueryOne).toHaveBeenCalledTimes(2)
  })

  it('blocks project comment writes without project access', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canAddComments: true, canViewProjects: false, canApproveWork: true }
    })
    await expect(commentWriteHandler({
      body: { content: 'Comment', projectId: 'project-1' }
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('blocks approval comment writes without approval access', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canAddComments: true, canViewProjects: true, canApproveWork: false }
    })
    await expect(commentWriteHandler({
      body: { content: 'Comment', approvalId: 'approval-1' }
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
