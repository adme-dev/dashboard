import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ transaction: (...args: unknown[]) => mocks.transaction(...args) }))

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

describe('portal setup proposal revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'user-1', clientId: 'client-1', role: 'manager' })
    mocks.transaction.mockImplementation(async (callback: (db: unknown) => Promise<unknown>) => callback({
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1', client_id: 'client-1', site_id: 'site-1', revision: 1, source: 'chat', brief: 'Need a limo site', status: 'proposed', plan: { businessName: 'Fantasy Limo', starterVersion: 'limousine-v1' } }] })
        .mockResolvedValueOnce({ rows: [{ id: 'proposal-2', revision: 2, status: 'proposed' }] })
    }))
  })

  it('creates a new reviewable revision from customer supplied facts', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.patch')
    await expect(handler({ id: 'site-1', body: { expectedRevision: 1, setupBrief: 'Phone 03 9000 0000, rates from $200, available every day' } } as never)).resolves.toEqual({ proposal: { id: 'proposal-2', revision: 2, status: 'proposed' } })
    const callbackDb = mocks.transaction.mock.calls[0][0]
    expect(callbackDb).toBeTypeOf('function')
  })

  it('rejects a stale revision before inserting', async () => {
    mocks.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => callback({
      query: vi.fn().mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1', client_id: 'client-1', site_id: 'site-1', revision: 2, source: 'template', status: 'proposed', plan: {} }] })
    }))
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.patch')
    await expect(handler({ id: 'site-1', body: { expectedRevision: 1, setupBrief: 'facts' } } as never)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('reads the persisted approval status and refuses to revise an accepted plan', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      tenant_id: 'tenant-1', client_id: 'client-1', site_id: 'site-1',
      revision: 1, source: 'chat', status: 'accepted', plan: {}
    }] })
    mocks.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => callback({ query }))
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[id]/setup-proposal.patch')

    await expect(handler({ id: 'site-1', body: { expectedRevision: 1, setupBrief: 'Changed facts' } } as never))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
    // A mocked row can otherwise hide a missing column in the real SELECT.
    expect(query.mock.calls[0]?.[0].split('FROM')[0]).toContain('proposal.status')
  })
})
