import { describe, expect, it, vi } from 'vitest'
import { readPageStudioEmailConfiguration, writePageStudioEmailConfiguration } from '~~/workers/page-studio-management/src/emailConfiguration'

const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const actorId = '10000000-0000-4000-8000-000000000003'
const settings = { senderName: 'Fleet', fromAddress: 'a@example.invalid', replyTo: 'b@example.invalid', notificationRecipient: 'c@example.invalid', inboundAddress: '', forwardingDestination: '' }
const request = { siteId, actor: { role: 'agency' as const, actorId, tenantId: 'selected', canEdit: true }, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } }
const row = { tenant_id: 'selected', client_id: clientId, site_status: 'active', entitlement_status: 'active', entitlement_effective: true, email_configuration: {} }
function dependencies(overrides = {}, member = { role: 'editor', user_role: 'manager' }) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM page_studio_sites') ? [{ ...row, ...overrides }] : sql.includes('FROM page_studio_site_memberships') ? [member] : sql.includes('FROM team_members') ? [{ user_role: 'owner', custom_role_id: null }] : [], rowCount: 1 }))
  return { query, transaction: async <T>(work: (db: { query: typeof query }) => Promise<T>) => work({ query }) }
}
describe('scoped customer email settings', () => {
  it('returns disabled readiness even with generic email credentials or caller verification claims', async () => {
    const result = await readPageStudioEmailConfiguration({ ...request, env: { ...request.env, EMAIL: {}, TRANSACTIONAL_EMAIL: {}, EMAIL_VERIFIED: true } }, dependencies())
    expect(result).toMatchObject({ revision: 0, settings: null, canEdit: true, environment: 'staging', readiness: { sendingEnabled: false, forwardingEnabled: false, status: 'not_configured' } })
  })
  it.each([undefined, '', 'preview', 'PRODUCTION'])('fails closed on trusted environment %s', async (value) => {
    const deps = dependencies()
    await expect(readPageStudioEmailConfiguration({ ...request, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: value } }, deps)).rejects.toMatchObject({ statusCode: 503 })
    expect(deps.query).not.toHaveBeenCalled()
  })
  it.each([{ site_status: 'archived' }, { site_status: 'suspended' }, { entitlement_status: 'revoked' }, { entitlement_effective: false }])('rejects unavailable scope %j', async (override) => {
    await expect(writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 0, settings } }, dependencies(override))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects mismatched tenant and malformed persisted settings', async () => {
    await expect(readPageStudioEmailConfiguration(request, dependencies({ tenant_id: 'foreign' }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(readPageStudioEmailConfiguration(request, dependencies({ email_configuration: { staging: { revision: 1, verified: true } } }))).rejects.toMatchObject({ statusCode: 503 })
  })
  it('checks portal membership and current role, preserving viewer read access', async () => {
    const portal = { ...request, actor: { role: 'client' as const, actorId, clientId } }
    for (const member of [{ role: 'viewer', user_role: 'manager' }, { role: 'editor', user_role: 'viewer' }]) {
      expect((await readPageStudioEmailConfiguration(portal, dependencies({}, member))).canEdit).toBe(false)
      await expect(writePageStudioEmailConfiguration({ ...portal, body: { expectedRevision: 0, settings } }, dependencies({}, member))).rejects.toMatchObject({ statusCode: 403 })
    }
  })
  it('denies agency read-only writes, unknown fields and stale revisions', async () => {
    await expect(writePageStudioEmailConfiguration({ ...request, actor: { ...request.actor, canEdit: false }, body: { expectedRevision: 0, settings } }, dependencies())).rejects.toMatchObject({ statusCode: 403 })
    await expect(writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 0, settings, verified: true } }, dependencies())).rejects.toMatchObject({ statusCode: 400 })
    await expect(writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 2, settings } }, dependencies())).rejects.toMatchObject({ statusCode: 409 })
  })
  it('saves only preferences and a redacted audit in one transaction', async () => {
    const deps = dependencies()
    const result = await writePageStudioEmailConfiguration({ ...request, body: { expectedRevision: 0, settings } }, deps)
    expect(result).toMatchObject({ revision: 1, settings, readiness: { status: 'setup_required', sendingEnabled: false } })
    const audit = deps.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO page_studio_audit_events'))
    expect(audit).toBeDefined()
    expect(JSON.stringify(audit)).not.toContain('example.invalid')
  })
})
