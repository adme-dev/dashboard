import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageStudioProvisioningJob } from '~~/server/utils/pageStudio/provisioningBinding'

const mocks = vi.hoisted(() => ({ access: vi.fn(), queryOneFresh: vi.fn(), readProvisioning: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.queryOneFresh }))
const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: { siteId: string }) => string
  setHeader: (event: unknown, name: string, value: string) => void
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.siteId
globals.setHeader = vi.fn()
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
const siteId = '50000000-0000-4000-8000-000000000901'
const clientId = '20000000-0000-4000-8000-000000000901'
const scope = { tenantId: 'agency-state', siteId, clientId, businessId: clientId, environment: 'staging' as const }
const row = () => ({ ...scope, name: 'Agency Limo Fixture', starterVersion: 'limousine-v1', revision: null, status: null, source: null, brief: null, plan: null })
const event = () => ({ siteId, context: { cloudflare: { env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: { readProvisioning: mocks.readProvisioning, createProvisioning: vi.fn() } } } } })

describe('agency website setup state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: scope.tenantId })
    mocks.queryOneFresh.mockResolvedValue(row())
    mocks.readProvisioning.mockResolvedValue(null)
  })
  it('returns an empty proposal for a scoped draft, without reading a nonexistent job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    await expect(handler(event() as never)).resolves.toMatchObject({ proposal: null, provisioning: null, supported: true, serviceAvailable: true })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_VIEW')
    expect(mocks.queryOneFresh.mock.calls[0][1]).toEqual([scope.tenantId, siteId])
    expect(mocks.readProvisioning).not.toHaveBeenCalled()
  })
  it('reads only the latest accepted revision in the authenticated site scope', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    mocks.queryOneFresh.mockResolvedValue({ ...row(), revision: 2, status: 'accepted', source: 'template', plan: { pages: ['home'] } })
    await expect(handler(event() as never)).resolves.toMatchObject({ proposal: { revision: 2, status: 'accepted' } })
    expect(mocks.readProvisioning).toHaveBeenCalledWith(`page-studio-${siteId}-2`, scope)
  })
  it('reads provisioning progress from the configured production scope', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    mocks.queryOneFresh.mockResolvedValue({ ...row(), revision: 2, status: 'accepted', source: 'template', plan: { pages: ['home'] } })
    const e = event()
    e.context.cloudflare.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    await handler(e as never)
    expect(mocks.readProvisioning).toHaveBeenCalledWith(`page-studio-${siteId}-2`, { ...scope, environment: 'production' })
  })
  it('returns verified progress without exposing provider resources or raw failure details', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    mocks.queryOneFresh.mockResolvedValue({ ...row(), revision: 1, status: 'accepted', source: 'template', plan: { pages: ['home'] } })
    const job = createPageStudioProvisioningJob({ initiatingUserId: '30000000-0000-4000-8000-000000000901', initiatingActorKind: 'agency-user', requestKey: `page-studio-${siteId}-1`, scope, revision: 1, source: 'template', now: '2026-09-10T00:00:00Z', plan: { businessName: 'Fixture', starterVersion: 'limousine-v1', pages: ['home'], collections: ['profile'], modules: ['business-content'] } })
    mocks.readProvisioning.mockResolvedValue({ ...job, phase: 'failed', error: 'Internal provider detail', resources: { database: 'private-resource', site: siteId, contentBinding: 'private-runtime' } })
    const result = await handler(event() as never)
    expect(result.provisioning).toEqual({ phase: 'failed', updatedAt: job.updatedAt })
    expect(JSON.stringify(result)).not.toMatch(/Internal provider|private-resource|private-runtime/)
  })
  it('rejects a malformed or foreign retained job instead of displaying its status', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    mocks.queryOneFresh.mockResolvedValue({ ...row(), revision: 1, status: 'accepted', source: 'template', plan: { pages: ['home'] } })
    mocks.readProvisioning.mockResolvedValue({ requestKey: `page-studio-${siteId}-1`, scope: { ...scope, tenantId: 'foreign' }, phase: 'complete' })
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('fails closed for an absent or foreign website before service access', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    mocks.queryOneFresh.mockResolvedValue(null)
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.readProvisioning).not.toHaveBeenCalled()
  })
  it('shows disconnected provisioning as unavailable and does not invent a queued job', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    await expect(handler({ siteId, context: {} } as never)).resolves.toMatchObject({ serviceAvailable: false, provisioning: null })
  })
  it('rejects an invalid site ID before database access', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.get')
    await expect(handler({ ...event(), siteId: 'foreign' } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queryOneFresh).not.toHaveBeenCalled()
  })
})
