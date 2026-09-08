import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), queryOne: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { id?: string }) => string | undefined
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.id
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal setup proposal reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'user-1', clientId: 'client-1' })
    mocks.queryOne.mockResolvedValue({ id: 'proposal-1', siteId: 'site-1', revision: 1, status: 'proposed' })
  })

  it('requires membership in the requested site', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.get')
    await expect(handler({ id: 'site-1' } as never)).resolves.toEqual({ proposal: expect.objectContaining({ id: 'proposal-1' }) })
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('membership.user_id = $2'), ['client-1', 'user-1', 'site-1'])
  })
})
