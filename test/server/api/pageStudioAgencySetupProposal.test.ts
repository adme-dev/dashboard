import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (fn: (db: { query: typeof mocks.query }) => Promise<unknown>) => fn({ query: mocks.query }) }))
interface TestEvent { siteId?: string, body?: unknown }
const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = (event: TestEvent) => event.siteId
globals.readBody = async (event: TestEvent) => event.body
globals.createError = (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input)
const siteId = '50000000-0000-4000-8000-000000000901'
const userId = '30000000-0000-4000-8000-000000000901'
const site = () => ({ tenant_id: 'tenant-agency', client_id: '20000000-0000-4000-8000-000000000901', id: siteId, name: 'Agency Limo Fixture', starter_version: 'limousine-v1', can_setup: true, pages_per_site_limit: 15, plan_metadata: { allowedModules: ['business-content', 'bookings', 'enquiries'] } })
const event = (body: unknown = { expectedRevision: 0, setupSource: 'template' }) => ({ siteId, body })

describe('agency-owned setup proposal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-agency', user: { id: userId } })
    mocks.query.mockResolvedValueOnce({ rows: [site()] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ siteId, revision: 1, status: 'proposed' }] })
  })
  it('builds a reviewable proposal from the scoped saved site without requiring a portal owner', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.post')
    await expect(handler(event() as never)).resolves.toEqual({ proposal: { siteId, revision: 1, status: 'proposed' } })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_EDIT')
    const [sql, values] = mocks.query.mock.calls[2]
    expect(sql).toContain('\'proposed\'')
    expect(values.at(-1)).toBe(userId)
    const plan = JSON.parse(values[6])
    expect(plan.businessName).toBe('Agency Limo Fixture')
    expect(plan.requiresAgencyReview).toBe(true)
    expect(plan.missingFacts).toContain('approved rates and minimum hire rules')
    expect(mocks.query.mock.calls[0][0]).toContain('FOR UPDATE OF site, entitlement')
    expect(mocks.query.mock.calls[0][0]).not.toContain('portal_creation_enabled')
  })
  it.each([{ expectedRevision: 0, setupSource: 'template', actor: userId }, { expectedRevision: 0, setupSource: 'chat' }, { expectedRevision: -1, setupSource: 'template' }])('rejects invalid bodies before accessing the database', async (body) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.post')
    await expect(handler(event(body) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each([null, { ...site(), can_setup: false }, { ...site(), pages_per_site_limit: 1 }, { ...site(), plan_metadata: { allowedModules: ['business-content'] } }])('does not retain an out-of-scope or unentitled proposal', async (row) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.post')
    mocks.query.mockReset().mockResolvedValueOnce({ rows: row ? [row] : [] })
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: row ? 403 : 404 })
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
  })
  it.each([{ revision: 1, status: 'proposed' }, { revision: 1, status: 'accepted' }])('does not overwrite a changed or accepted revision', async (current) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.post')
    mocks.query.mockReset().mockResolvedValueOnce({ rows: [site()] }).mockResolvedValueOnce({ rows: [current] })
    await expect(handler(event({ expectedRevision: current.status === 'accepted' ? 1 : 0, setupSource: 'template' }) as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })
})
