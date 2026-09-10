import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const mocks = vi.hoisted(() => ({ access: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.queryOneFresh }))
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
const clientId = '20000000-0000-4000-8000-000000000901'
const userId = '30000000-0000-4000-8000-000000000901'
const plan = createPageStudioSetupProposal({ businessName: 'Agency Limo Fixture', starterVersion: 'limousine-v1', setupSource: 'template' })
const row = () => ({ tenantId: 'tenant-agency', clientId, siteId, userId, revision: 1, status: 'accepted', source: 'template', brief: null, plan, canProvision: true, pagesPerSiteLimit: 15, planMetadata: { allowedModules: plan.modules } })
function event(body: unknown = { expectedRevision: 1 }) {
  let stored: unknown = null
  const binding = { readProvisioning: vi.fn(async () => stored), createProvisioning: vi.fn(async (job) => {
    stored = job
    return job
  }) }
  return { siteId, body, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONER: binding } } }, binding }
}

describe('agency accepted setup dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-agency', user: { id: userId } })
    mocks.queryOneFresh.mockResolvedValue(row())
  })
  it('derives the actor from staff authentication and verifies fresh authority before creating a job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    const result = await handler(e as never)
    expect(result.provisioning.job.actor).toEqual({ kind: 'agency-user', userId })
    expect(result.provisioning.job.scope).toEqual({ tenantId: 'tenant-agency', clientId, businessId: clientId, siteId, environment: 'staging' })
    expect(mocks.access).toHaveBeenCalledWith(e, 'PAGE_STUDIO_EDIT')
    expect(mocks.queryOneFresh.mock.calls[1][0]).toContain('JOIN team_members owner')
    expect(mocks.queryOneFresh.mock.invocationCallOrder[1]).toBeLessThan(e.binding.createProvisioning.mock.invocationCallOrder[0]!)
  })
  it.each([{ expectedRevision: 1, actor: { kind: 'agency-user', userId } }, { expectedRevision: 0 }, { expectedRevision: 1, tenantId: 'foreign' }])('rejects body identity or invalid revision before database access', async (body) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event(body)
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
    expect(e.binding.createProvisioning).not.toHaveBeenCalled()
  })
  it.each([null, { ...row(), revision: 2 }, { ...row(), status: 'proposed' }])('requires the current accepted proposal', async (current) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    mocks.queryOneFresh.mockResolvedValueOnce(current)
    const e = event()
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: current ? 409 : 404 })
    expect(e.binding.createProvisioning).not.toHaveBeenCalled()
  })
  it('denies revoked staff or entitlement before dispatch even if the session had edit access', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    mocks.queryOneFresh.mockResolvedValueOnce(row()).mockResolvedValueOnce(null)
    const e = event()
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(e.binding.createProvisioning).not.toHaveBeenCalled()
  })
  it('rechecks the original actor on a replay by a different staff member', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    await handler(e as never)
    const other = '30000000-0000-4000-8000-000000000902'
    mocks.access.mockResolvedValueOnce({ tenantId: 'tenant-agency', user: { id: other } })
    mocks.queryOneFresh.mockResolvedValueOnce(row()).mockResolvedValueOnce({ ...row(), userId: other }).mockResolvedValueOnce(null)
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(e.binding.createProvisioning).toHaveBeenCalledOnce()
  })
})
