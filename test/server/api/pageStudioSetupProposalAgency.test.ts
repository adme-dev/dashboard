import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), queryRows: vi.fn(), queryOne: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.access(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryRows: (...args: unknown[]) => mocks.queryRows(...args), queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { siteId?: string }) => string | undefined
  readBody: (event: { body?: unknown }) => Promise<unknown>
  getQuery: (event: { query?: Record<string, unknown> }) => Record<string, unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.siteId
globals.readBody = async event => event.body
globals.getQuery = event => event.query ?? {}
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('agency Page Studio setup proposal review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-a', user: { id: 'agency-user' } })
  })

  it('lists proposals scoped to the selected tenant', async () => {
    mocks.queryRows.mockResolvedValue([{ id: 'p1', tenantId: 'tenant-a', status: 'proposed' }])
    const { default: handler } = await import('~~/server/api/agency/page-studio/setup-proposals.get')
    await expect(handler({ query: { status: 'proposed' } } as never)).resolves.toEqual({ proposals: [{ id: 'p1', tenantId: 'tenant-a', status: 'proposed' }] })
    expect(mocks.queryRows).toHaveBeenCalledWith(expect.stringContaining('proposal.tenant_id = $1'), ['tenant-a', 'proposed'])
  })

  it('accepts a proposed revision with tenant and optimistic revision guards', async () => {
    mocks.queryOne.mockResolvedValue({ id: 'p1', siteId: 's1', revision: 1, status: 'accepted' })
    const { default: handler } = await import('~~/server/api/agency/page-studio/setup-proposals/[siteId]/decision.post')
    await expect(handler({ siteId: 's1', body: { decision: 'accepted', expectedRevision: 1 } } as never)).resolves.toEqual({ proposal: { id: 'p1', siteId: 's1', revision: 1, status: 'accepted' } })
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('status = \'proposed\''), ['accepted', 'agency-user', 'tenant-a', 's1', 1])
  })
})
