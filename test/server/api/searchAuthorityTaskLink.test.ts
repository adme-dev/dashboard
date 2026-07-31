import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const mocks = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  requireAuth: vi.fn(),
  requireAccess: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn()
}))

vi.mock('h3', () => ({
  getRouterParam: () => OPPORTUNITY_ID
}))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: mocks.requireAuth
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  execute: mocks.execute
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)

describe('Search Authority task linking', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'agency-user' })
    mocks.body = { taskId: TASK_ID }
    mocks.queryOne
      .mockResolvedValueOnce({
        id: OPPORTUNITY_ID,
        client_id: CLIENT_ID,
        lifecycle_status: 'accepted',
        task_id: null
      })
      .mockResolvedValueOnce({
        id: TASK_ID,
        title: 'Review H6 search snippet'
      })
    mocks.execute.mockResolvedValue(1)
  })

  it('authenticates before resolving an opportunity owner', async () => {
    mocks.requireAuth.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    )
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id]/task-link.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 401
    })
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })

  it('atomically links an existing task only after explicit acceptance', async () => {
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id]/task-link.post'
    )).default
    const result = await handler({} as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining(`lifecycle_status = 'task_created'`),
      [OPPORTUNITY_ID, CLIENT_ID, TASK_ID]
    )
    expect(result).toEqual({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      task: {
        id: TASK_ID,
        title: 'Review H6 search snippet'
      },
      status: 'task_created'
    })
  })

  it('rejects duplicate or stale linking attempts with 409', async () => {
    mocks.execute.mockResolvedValue(0)
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id]/task-link.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409
    })
  })

  it('does not advance lifecycle when persistence fails', async () => {
    mocks.execute.mockRejectedValue(new Error('database unavailable'))
    const handler = (await import(
      '~~/server/api/agency/search-authority/opportunities/[id]/task-link.post'
    )).default

    await expect(handler({} as never)).rejects.toThrow('database unavailable')
    expect(mocks.execute).toHaveBeenCalledOnce()
  })
})
