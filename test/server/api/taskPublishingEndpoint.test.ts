import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ write: vi.fn(), role: vi.fn(), board: vi.fn(), client: vi.fn(), handoff: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.write, requireRole: mocks.role, requireBoardAccess: mocks.board }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.client }))
vi.mock('~~/server/utils/taskPublishing', async original => ({ ...await original<typeof import('~~/server/utils/taskPublishing')>(), handoffTaskPublishing: mocks.handoff }))
Object.assign(globalThis, { defineEventHandler: <T>(h: T) => h, getRouterParam: (event: { id: string }) => event.id, readBody: async (event: { body: unknown }) => event.body })
const { default: handler } = await import('~~/server/api/agency/tasks/[id]/publishing.post')
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue({ id: 'staff' })
  mocks.handoff.mockImplementation(async (_id, _actor, _body, authorize) => {
    await authorize('resolved-client', 'resolved-board')
    return { post: { id: 'saved', status: 'draft' } }
  })
})
describe('task publishing handoff boundary', () => {
  it('checks write, creative, board and resolved client access', async () => {
    const event = { id, body: {} }
    await expect(handler(event as never)).resolves.toMatchObject({ post: { status: 'draft' } })
    expect(mocks.write).toHaveBeenCalledWith(event)
    expect(mocks.role).toHaveBeenCalledOnce()
    expect(mocks.board).toHaveBeenCalledWith(event, 'resolved-board')
    expect(mocks.client).toHaveBeenCalledWith(event, 'resolved-client')
  })
  it.each([{ clientId: id }, { status: 'scheduled' }, { approvedAt: 'now' }, { postId: 'bad' }])('rejects caller-owned workflow fields %j', async (body) => {
    await expect(handler({ id, body } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.handoff).not.toHaveBeenCalled()
  })
  it('stops if board access is denied', async () => {
    mocks.board.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(handler({ id, body: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.client).not.toHaveBeenCalled()
  })
})
