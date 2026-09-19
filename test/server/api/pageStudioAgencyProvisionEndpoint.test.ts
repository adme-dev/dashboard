import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const mocks = vi.hoisted(() => ({ access: vi.fn(), queryOneFresh: vi.fn(), resolveLogin: vi.fn(), bindLogin: vi.fn(), db: { query: vi.fn() } }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.queryOneFresh, transaction: (operation: (db: unknown) => Promise<unknown>) => operation(mocks.db) }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.resolveLogin, bindPageStudioLoginSession: mocks.bindLogin }))
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
  return { siteId, body, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: binding } } }, binding }
}

describe('agency accepted setup dispatch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.resolveLogin.mockResolvedValue({ role: 'agency', userId, tokenHash: 'a'.repeat(64) })
    mocks.bindLogin.mockResolvedValue(undefined)
    mocks.access.mockResolvedValue({ tenantId: 'tenant-agency', user: { id: userId } })
    mocks.queryOneFresh.mockResolvedValue(row())
  })
  it('derives the actor from staff authentication and verifies fresh authority before creating a job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    const result = await handler(e as never)
    expect(result.provisioning.job.generationVersion).toBe(2)
    expect(result.provisioning.job.actor).toEqual({ kind: 'agency-user', userId })
    expect(result.provisioning.job.scope).toEqual({ tenantId: 'tenant-agency', clientId, businessId: clientId, siteId, environment: 'staging' })
    expect(mocks.access).toHaveBeenCalledWith(e, 'PAGE_STUDIO_EDIT')
    expect(mocks.queryOneFresh.mock.calls[1][0]).toContain('JOIN team_members owner')
    expect(mocks.queryOneFresh.mock.invocationCallOrder[1]).toBeLessThan(e.binding.createProvisioning.mock.invocationCallOrder[0]!)
  })
  it('binds the actual native event and includes its digest only in the private job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    const result = await handler(e as never)
    expect(mocks.resolveLogin).toHaveBeenCalledWith(mocks.db, e, 'agency', userId)
    expect(mocks.bindLogin).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ tokenHash: 'a'.repeat(64) }))
    expect(e.binding.createProvisioning.mock.calls[0][0].actor.loginSessionHash).toBe('a'.repeat(64))
    expect(JSON.stringify(result)).not.toContain('loginSessionHash')
  })
  it('denies an invalidated login before reading or creating a retained job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    mocks.resolveLogin.mockRejectedValueOnce(Object.assign(new Error('Signed out'), { statusCode: 401 }))
    const e = event()
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(e.binding.readProvisioning).not.toHaveBeenCalled()
    expect(e.binding.createProvisioning).not.toHaveBeenCalled()
  })
  it('rechecks the original login on a same-user replay instead of adopting the new login', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    await handler(e as never)
    mocks.resolveLogin.mockResolvedValueOnce({ role: 'agency', userId, tokenHash: 'b'.repeat(64) })
    mocks.queryOneFresh.mockResolvedValueOnce(row()).mockResolvedValueOnce(row()).mockResolvedValueOnce(null)
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(e.binding.createProvisioning).toHaveBeenCalledOnce()
  })
  it('uses production scope when configured by the server', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    e.context.cloudflare.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    const result = await handler(e as never)
    expect(result.provisioning.job.scope.environment).toBe('production')
    expect(e.binding.readProvisioning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ environment: 'production' }))
  })
  it('does not create a staging job when the environment setting is absent', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const e = event()
    e.context.cloudflare.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = ''
    await expect(handler(e as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(e.binding.createProvisioning).not.toHaveBeenCalled()
    expect(e.binding.readProvisioning).not.toHaveBeenCalled()
  })
  it.each([{ expectedRevision: 1, actor: { kind: 'agency-user', userId } }, { expectedRevision: 0 }, { expectedRevision: 1, generationVersion: 2 }, { expectedRevision: 1, generationVersion: 1 }, { expectedRevision: 1, tenantId: 'foreign' }])('rejects body identity or invalid revision before database access', async (body) => {
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
  it('resumes a retained legacy job with its original generation and no new create', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/provision.post')
    const { createPageStudioProvisioningJob } = await import('~~/server/utils/pageStudio/provisioningBinding')
    const e = event()
    const candidate = createPageStudioProvisioningJob({
      initiatingActorKind: 'agency-user', initiatingUserId: userId, initiatingLoginSessionHash: 'a'.repeat(64),
      requestKey: `page-studio-${siteId}-1`,
      scope: { tenantId: 'tenant-agency', clientId, businessId: clientId, siteId, environment: 'staging' },
      source: 'template', revision: 1, brief: null, plan, now: '2026-09-15T00:00:00.000Z'
    })
    const { generationVersion: _version, ...legacy } = candidate
    const retained = { ...legacy, phase: 'resources-created' }
    e.binding.readProvisioning.mockResolvedValue(retained)
    const result = await handler(e as never)
    expect(result.provisioning.job).toEqual({ ...retained, actor: { kind: retained.actor!.kind, userId } })
    expect(result.provisioning.job).not.toHaveProperty('generationVersion')
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
