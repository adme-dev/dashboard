import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), queryOne: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { id?: string }, key: string) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.id
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal setup proposal decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'user-1', clientId: 'client-1', role: 'manager' })
    mocks.queryOne.mockResolvedValue({ id: 'proposal-1', revision: 1, status: 'accepted' })
  })

  it('accepts only the expected proposed revision', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.post')
    await expect(handler({ id: 'site-1', body: { decision: 'accepted', expectedRevision: 1 } } as never)).resolves.toEqual({ proposal: expect.objectContaining({ status: 'accepted' }) })
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('membership.user_id = $6'), ['accepted', 'user-1', 'client-1', 'site-1', 1, 'user-1'])
  })

  it('fails closed for viewers', async () => {
    mocks.requireClientAuth.mockResolvedValue({ id: 'user-1', clientId: 'client-1', role: 'viewer' })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.post')
    await expect(handler({ id: 'site-1', body: { decision: 'accepted', expectedRevision: 1 } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })
})
