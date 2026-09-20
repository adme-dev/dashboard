import { describe, expect, it, vi } from 'vitest'
import { contentLogin } from '../../fixtures/pageStudioContentLogin'
import { readPageStudioBusinessContent, writePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContent'

const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const actor = { role: 'client' as const, actorId: 'user_test', clientId: 'client_test' }
const scope = { tenantId: 'tenant_test', clientId: 'client_test', businessId: 'client_test', siteId, environment: 'staging' as const }
const row = { tenant_id: scope.tenantId, client_id: scope.clientId, site_status: 'draft', entitlement_status: 'active', entitlement_effective: true, membership_role: 'editor', native_can_view: true, native_can_edit: true }
const content = { schemaVersion: 1, scope, collections: [] }
const revision = { content, revision: 1, actorId: actor.actorId, createdAt: '2026-09-07 12:00:00' }
function setup(overrides = {}) {
  const service = { readContent: vi.fn().mockResolvedValue(revision), writeContent: vi.fn().mockResolvedValue(revision), listFormSubmissions: vi.fn().mockResolvedValue([]) }
  const env: Record<string, unknown> = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: service }
  const query = vi.fn().mockResolvedValue({ ...row, ...overrides })
  return { service, env, query }
}

describe('authenticated business content adapter', () => {
  it.each([
    { membership_role: null }, { site_status: 'suspended' },
    { entitlement_effective: false }, { entitlement_status: 'cancelled' }
  ])('withholds a completed read when authority changes during RPC: %j', async (change) => {
    const { env, query, service } = setup()
    service.readContent.mockImplementationOnce(async () => {
      query.mockResolvedValue({ ...row, ...change })
      return revision
    })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('withholds an empty read when the client is deactivated during RPC', async () => {
    const { env, query, service } = setup()
    service.readContent.mockImplementationOnce(async () => {
      query.mockResolvedValue(null)
      return null
    })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('returns current read-only permissions after an editor becomes a viewer during RPC', async () => {
    const { env, query, service } = setup()
    service.readContent.mockImplementationOnce(async () => {
      query.mockResolvedValue({ ...row, membership_role: 'viewer' })
      return revision
    })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).resolves.toMatchObject({ revision: 1, canEdit: false })
  })
  it('withholds old client content after a site is reassigned within the agency during RPC', async () => {
    const { env, query, service } = setup()
    service.readContent.mockImplementationOnce(async () => {
      query.mockResolvedValue({ ...row, client_id: 'different_client' })
      return revision
    })
    const agency = { role: 'agency' as const, actorId: 'staff', tenantId: row.tenant_id, canEdit: true }
    await expect(readPageStudioBusinessContent({ actor: agency, login: contentLogin(agency), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not return content when the final authority query is unavailable', async () => {
    const { env, query, service } = setup()
    service.readContent.mockImplementationOnce(async () => {
      query.mockRejectedValue(new Error('authority unavailable'))
      return revision
    })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toThrow('authority unavailable')
  })
  it('derives scope and actor from trusted sources and submits expected revision', async () => {
    const { env, query, service } = setup()
    const result = await writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })
    expect(service.writeContent).toHaveBeenCalledWith({ actorId: actor.actorId, content, expectedRevision: 0 })
    expect(result.revision).toBe(1)
    expect(query.mock.calls[0][1]).toEqual([actor.clientId, siteId, actor.actorId, expect.any(String), expect.any(Date), expect.any(Date)])
  })
  it.each([
    { entitlement_effective: false }, { entitlement_status: 'cancelled' },
    { site_status: 'suspended' }, { site_status: 'archived' },
    { membership_role: null }, { membership_role: 'viewer' }
  ])('denies an unauthorised write before RPC: %j', async (override) => {
    const { env, query, service } = setup(override)
    await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(service.writeContent).not.toHaveBeenCalled()
  })
  it('allows a viewer to read but denies absent membership', async () => {
    const { env, query } = setup({ membership_role: 'viewer' })
    expect(await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).toMatchObject({ revision: 1, canEdit: false })
    query.mockResolvedValueOnce({ ...row, membership_role: null })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not expose content when a site is outside the authenticated client scope', async () => {
    const { env, query, service } = setup()
    query.mockResolvedValueOnce(null)
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 404 })
    expect(service.readContent).not.toHaveBeenCalled()
  })

  it('fails closed for an invalid content environment', async () => {
    const { env, query, service } = setup()
    env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'live'
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 503 })
    expect(service.readContent).not.toHaveBeenCalled()
  })
  it.each(['businessId', 'clientId', 'tenantId', 'siteId', 'environment'])('rejects mismatched response scope %s and unexpected write revisions', async (axis) => {
    const { env, query, service } = setup()
    service.readContent.mockResolvedValueOnce({ ...revision, content: { ...content, scope: { ...scope, [axis]: axis === 'environment' ? 'production' : 'other' } } })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 502 })
    service.writeContent.mockResolvedValueOnce({ ...revision, revision: 9 })
    await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('maps stale writes to 409 and hides arbitrary upstream errors', async () => {
    const { env, query, service } = setup()
    service.writeContent.mockRejectedValueOnce(new Error('Content revision conflict'))
    await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 409 })
    service.readContent.mockRejectedValueOnce(new Error('secret provider details'))
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 502, message: 'Business content service is unavailable' })
  })
  it('represents an uninitialised store honestly and rejects forged body authority', async () => {
    const { env, query, service } = setup()
    service.readContent.mockResolvedValueOnce(null)
    expect(await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).toMatchObject({ revision: 0, content: null })
    await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0, actorId: 'forged' } }, { query })).rejects.toMatchObject({ statusCode: 400 })
    expect(service.writeContent).not.toHaveBeenCalled()
  })
})

describe('authenticated provisioned content routing', () => {
  function dynamicSetup(overrides = {}) {
    const query = vi.fn().mockResolvedValue({ ...row, ...overrides })
    const resolvedScope = { ...scope, businessId: row.client_id, environment: 'staging' as const }
    const resolvedContent = { ...content, scope: resolvedScope }
    const result = { ...revision, content: resolvedContent }
    const router = { readContent: vi.fn().mockResolvedValue(result), writeContent: vi.fn().mockResolvedValue(result), listFormSubmissions: vi.fn().mockResolvedValue([]) }
    const env: Record<string, unknown> = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: router }
    return { env, query, resolvedContent, resolvedScope, result, router }
  }
  it('derives provisioned scope from the authorised database row without a per-site binding', async () => {
    const s = dynamicSetup()
    expect(await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env }, { query: s.query })).toMatchObject({ revision: 1, canEdit: true })
    expect(s.router.readContent).toHaveBeenCalledWith(s.resolvedScope)
    expect(await writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env, body: { collections: [], expectedRevision: 0 } }, { query: s.query })).toEqual(s.result)
    expect(s.router.writeContent).toHaveBeenCalledWith({ actorId: actor.actorId, content: s.resolvedContent, expectedRevision: 0 })
    expect(s.query).toHaveBeenCalledTimes(3)
  })

  it('keeps editor, viewer and agency permissions ahead of all routing calls', async () => {
    const s = dynamicSetup({ membership_role: 'viewer' })
    expect(await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env }, { query: s.query })).toMatchObject({ canEdit: false })
    await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env, body: { collections: [], expectedRevision: 0 } }, { query: s.query })).rejects.toMatchObject({ statusCode: 403 })
    await expect(writePageStudioBusinessContent({ actor: { role: 'agency', tenantId: row.tenant_id, actorId: 'agency_user', canEdit: false }, login: contentLogin({ role: 'agency', actorId: 'agency_user' }), siteId, env: s.env, body: { collections: [], expectedRevision: 0 } }, { query: s.query })).rejects.toMatchObject({ statusCode: 403 })
    expect(s.router.writeContent).not.toHaveBeenCalled()
    s.query.mockResolvedValueOnce({ ...row, entitlement_effective: false })
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env }, { query: s.query })).rejects.toMatchObject({ statusCode: 403 })
    expect(s.router.readContent).toHaveBeenCalledOnce()
  })
  it('represents inactive routes as pending setup and hides resolver failures', async () => {
    const s = dynamicSetup()
    s.router.readContent.mockRejectedValueOnce(new Error('Content route is inactive'))
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env }, { query: s.query })).rejects.toMatchObject({ code: 'CONTENT_NOT_CONFIGURED', statusCode: 503 })
    s.router.readContent.mockRejectedValueOnce(new Error('private database identifiers'))
    await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env: s.env }, { query: s.query })).rejects.toMatchObject({ statusCode: 502, message: 'Business content service is unavailable' })
  })
})

it.each([undefined, 'preview', 'live'])('requires an explicit supported environment: %s', async (environment) => {
  const { env, query, service } = setup()
  env.PAGE_STUDIO_CONTENT_ENVIRONMENT = environment
  await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 503 })
  expect(service.readContent).not.toHaveBeenCalled()
})
it('ignores historical static maps and only uses the scoped router', async () => {
  const { env, query, service } = setup()
  env.PAGE_STUDIO_CONTENT_BINDINGS = '{obsolete'
  await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })
  expect(service.readContent).toHaveBeenCalledWith(scope)
  delete env.PAGE_STUDIO_CONTENT_ROUTER
  await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 503 })
})
it('freshly checks active client, entitlement association and scoped membership', async () => {
  const { env, query } = setup()
  await readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })
  expect(query.mock.calls[0][0]).toContain('client.is_active = TRUE')
  expect(query.mock.calls[0][0]).toContain('entitlement.id = site.entitlement_id')
  expect(query.mock.calls[0][0]).toContain('membership.user_id = owner.id')
  query.mockResolvedValueOnce({ ...row, client_id: 'foreign_client' })
  await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 404 })
})

it.each([
  { ...revision, actorId: 'other_actor' },
  { ...revision, content: { ...content, collections: [{ id: 'unexpected', records: [] }] } }
])('rejects a write acknowledgement for another actor or changed payload', async (receipt) => {
  const { env, query, service } = setup()
  service.writeContent.mockResolvedValueOnce(receipt)
  await expect(writePageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 502, code: 'CONTENT_RESPONSE_INVALID' })
})

it.each(['before', 'during'] as const)('denies native logout %s the remote read', async (phase) => {
  const { env, query, service } = setup()
  if (phase === 'before') query.mockResolvedValue({ ...row, native_can_view: false })
  else service.readContent.mockImplementationOnce(async () => {
    query.mockResolvedValue({ ...row, native_can_view: false })
    return revision
  })
  await expect(readPageStudioBusinessContent({ actor, login: contentLogin(actor), siteId, env }, { query })).rejects.toMatchObject({ statusCode: 403 })
  if (phase === 'before') expect(service.readContent).not.toHaveBeenCalled()
})
it('uses current agency editing permission after the remote read', async () => {
  const { env, query, service } = setup()
  const agency = { role: 'agency' as const, actorId: 'staff', tenantId: row.tenant_id, canEdit: true }
  service.readContent.mockImplementationOnce(async () => {
    query.mockResolvedValue({ ...row, native_can_edit: false })
    return revision
  })
  await expect(readPageStudioBusinessContent({ actor: agency, login: contentLogin(agency), siteId, env }, { query })).resolves.toMatchObject({ canEdit: false })
})
it('fails closed without a matching native login before querying or dispatching', async () => {
  const { env, query, service } = setup()
  for (const login of [undefined, { ...contentLogin(actor), userId: 'other' }, { ...contentLogin(actor), role: 'agency' }]) {
    await expect(readPageStudioBusinessContent({ actor, login, siteId, env } as never, { query })).rejects.toMatchObject({ statusCode: 403 })
  }
  expect(query).not.toHaveBeenCalled()
  expect(service.readContent).not.toHaveBeenCalled()
})
it('does not grant an agency write from earlier role permission', async () => {
  const { env, query, service } = setup({ native_can_edit: false })
  const agency = { role: 'agency' as const, actorId: 'staff', tenantId: row.tenant_id, canEdit: true }
  await expect(writePageStudioBusinessContent({ actor: agency, login: contentLogin(agency), siteId, env, body: { collections: [], expectedRevision: 0 } }, { query })).rejects.toMatchObject({ statusCode: 403 })
  expect(service.writeContent).not.toHaveBeenCalled()
})
