import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: commentsHandler } = await import(
  '../../../../server/api/portal/comments/index.get'
)

describe('portal comments tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canViewProjects: true, canApproveWork: true }
    })
    mockQueryRows.mockResolvedValue([])
  })

  it('rejects an unscoped comments request before reading comments', async () => {
    await expect(commentsHandler({ query: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Exactly one comment scope is required'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('rejects a request containing both project and approval scopes', async () => {
    await expect(commentsHandler({
      query: { projectId: 'project-1', approvalId: 'approval-1' }
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Exactly one comment scope is required'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('scopes project comments through a project owned by the authenticated client', async () => {
    await commentsHandler({ query: { projectId: 'project-1' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('cc.project_id = $1')
    expect(sql).toContain('p.client_id = $2')
    expect(sql).toContain('show_comments')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['project-1', 'client-1', 50])
  })

  it('scopes approval comments through the approval project owned by the authenticated client', async () => {
    await commentsHandler({ query: { approvalId: 'approval-1' } })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('cc.approval_id = $1')
    expect(sql).toContain('ca.id = cc.approval_id')
    expect(sql).toContain('p.client_id = $2')
    expect(sql).toContain('show_comments')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['approval-1', 'client-1', 50])
  })

  it('blocks project comments without project access', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canViewProjects: false, canApproveWork: true }
    })
    await expect(commentsHandler({ query: { projectId: 'project-1' } }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('blocks approval comments without approval access', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canViewProjects: true, canApproveWork: false }
    })
    await expect(commentsHandler({ query: { approvalId: 'approval-1' } }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
