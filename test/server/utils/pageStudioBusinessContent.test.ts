import { describe, expect, it, vi } from 'vitest'
import { listPageStudioBusinessSubmissions, readPageStudioBusinessContent, writePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContent'

const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const actor = { role: 'client' as const, actorId: 'user_test', clientId: 'client_test' }
const scope = { tenantId: 'tenant_test', clientId: 'client_test', businessId: 'business_test', siteId, environment: 'preview' as const }
const row = { tenant_id: scope.tenantId, client_id: scope.clientId, site_status: 'draft', entitlement_status: 'active', entitlement_effective: true, membership_role: 'editor' }
const content = { schemaVersion: 1, scope, collections: [] }
const revision = { content, revision: 1, actorId: actor.actorId, createdAt: '2026-09-07 12:00:00' }
function setup(overrides = {}) {
  const service = { readContent: vi.fn().mockResolvedValue(revision), writeContent: vi.fn().mockResolvedValue(revision), listFormSubmissions: vi.fn().mockResolvedValue([]) }
  const env = { PAGE_STUDIO_CONTENT_BINDINGS: JSON.stringify([{ scope, bindingName: 'CONTENT_TEST' }]), CONTENT_TEST: service }
  const query = vi.fn().mockResolvedValue({ ...row, ...overrides })
  return { service, env, query }
}

describe('authenticated business content adapter', () => {
  it('derives scope and actor from trusted sources and submits expected revision', async () => {
    const { env, query, service } = setup()
    const result = await writePageStudioBusinessContent({ actor, siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })
    expect(service.writeContent).toHaveBeenCalledWith({ actorId: actor.actorId, content, expectedRevision: 0 })
    expect(result.revision).toBe(1)
    expect(query.mock.calls[0][1]).toEqual([actor.clientId, siteId, actor.actorId])
  })
  it.each([
    { entitlement_effective: false }, { entitlement_status: 'cancelled' },
    { site_status: 'suspended' }, { site_status: 'archived' },
    { membership_role: null }, { membership_role: 'viewer' }
  ])('denies an unauthorised write before RPC: %j', async (override) => {
    const { env, query, service } = setup(override)
    await expect(writePageStudioBusinessContent({ actor, siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(service.writeContent).not.toHaveBeenCalled()
  })
  it('allows a viewer to read but denies absent membership', async () => {
    const { env, query } = setup({ membership_role: 'viewer' })
    expect(await readPageStudioBusinessContent({ actor, siteId, env }, { query })).toMatchObject({ revision: 1, canEdit: false })
    query.mockResolvedValueOnce({ ...row, membership_role: null })
    await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not expose content when a site is outside the authenticated client scope', async () => {
    const { env, query, service } = setup()
    query.mockResolvedValueOnce(null)
    await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 404 })
    expect(service.readContent).not.toHaveBeenCalled()
  })
  it('rejects absent, ambiguous and foreign binding configuration', async () => {
    const { env, query, service } = setup()
    for (const bindings of [[], [{ scope: { ...scope, tenantId: 'other' }, bindingName: 'CONTENT_TEST' }], [{ scope, bindingName: 'CONTENT_TEST' }, { scope, bindingName: 'CONTENT_TEST' }]]) {
      env.PAGE_STUDIO_CONTENT_BINDINGS = JSON.stringify(bindings)
      await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 503 })
    }
    expect(service.readContent).not.toHaveBeenCalled()
  })
  it('selects an explicitly configured staging binding without falling back to preview', async () => {
    const { env, query, service } = setup()
    const stagingScope = { ...scope, environment: 'staging' as const }
    env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'staging'
    env.PAGE_STUDIO_CONTENT_BINDINGS = JSON.stringify([{ scope: stagingScope, bindingName: 'CONTENT_TEST' }])
    service.readContent.mockResolvedValueOnce({ ...revision, content: { ...content, scope: stagingScope } })
    expect(await readPageStudioBusinessContent({ actor, siteId, env }, { query })).toMatchObject({ revision: 1 })
    expect(service.readContent).toHaveBeenCalledWith(stagingScope)
  })
  it('fails closed for an invalid content environment', async () => {
    const { env, query, service } = setup()
    env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'live'
    await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 503 })
    expect(service.readContent).not.toHaveBeenCalled()
  })
  it('rejects response scope mismatches and unexpected write revisions', async () => {
    const { env, query, service } = setup()
    service.readContent.mockResolvedValueOnce({ ...revision, content: { ...content, scope: { ...scope, businessId: 'other' } } })
    await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 502 })
    service.writeContent.mockResolvedValueOnce({ ...revision, revision: 9 })
    await expect(writePageStudioBusinessContent({ actor, siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('maps stale writes to 409 and hides arbitrary upstream errors', async () => {
    const { env, query, service } = setup()
    service.writeContent.mockRejectedValueOnce(new Error('Content revision conflict'))
    await expect(writePageStudioBusinessContent({ actor, siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 409 })
    service.readContent.mockRejectedValueOnce(new Error('secret provider details'))
    await expect(readPageStudioBusinessContent({ actor, siteId, env }, { query })).rejects.toMatchObject({ statusCode: 502, message: 'Business content service is unavailable' })
  })
  it('represents an uninitialised store honestly and rejects forged body authority', async () => {
    const { env, query, service } = setup()
    service.readContent.mockResolvedValueOnce(null)
    expect(await readPageStudioBusinessContent({ actor, siteId, env }, { query })).toMatchObject({ revision: 0, content: null })
    await expect(writePageStudioBusinessContent({ actor, siteId, env, body: { collections: [], expectedRevision: 0, actorId: 'forged' } }, { query })).rejects.toMatchObject({ statusCode: 400 })
    expect(service.writeContent).not.toHaveBeenCalled()
  })
  it('reads only scope-matching form submissions through the configured service', async () => {
    const { env, query, service } = setup()
    service.listFormSubmissions.mockResolvedValueOnce([{
      fieldData: { email: 'guest@example.com' },
      formId: 'form_booking',
      id: 'submission_one',
      pageId: 'page_home',
      scope,
      submittedAt: '2026-09-08T10:00:00.000Z'
    }])
    const result = await listPageStudioBusinessSubmissions({ actor, siteId, env }, { formId: 'form_booking', limit: 10 }, { query })
    expect(result).toHaveLength(1)
    expect(service.listFormSubmissions).toHaveBeenCalledWith({ formId: 'form_booking', limit: 10 })
    service.listFormSubmissions.mockResolvedValueOnce([{ ...result[0], scope: { ...scope, businessId: 'foreign' } }])
    await expect(listPageStudioBusinessSubmissions({ actor, siteId, env }, {}, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('fails honestly when the configured service has no submission reader', async () => {
    const { env, query, service } = setup()
    const serviceWithoutReader = { ...service, listFormSubmissions: undefined }
    env.CONTENT_TEST = serviceWithoutReader
    await expect(listPageStudioBusinessSubmissions({ actor, siteId, env }, {}, { query })).rejects.toMatchObject({ statusCode: 503 })
  })
})
