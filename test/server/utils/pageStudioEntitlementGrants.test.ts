import { describe, expect, it, vi } from 'vitest'
import { grantPageStudioEntitlement, PageStudioEntitlementGrantBody } from '~~/server/utils/pageStudio/entitlementGrants'
import type { PageStudioQueryClient } from '~~/server/utils/pageStudio/sites'

const actorId = '30000000-0000-4000-8000-000000000901'
const tenantId = 'tenant-grant-test'
const body = {
  requestId: '60000000-0000-4000-8000-000000000901',
  clientId: '20000000-0000-4000-8000-000000000901',
  planKey: 'agency-review', status: 'trial' as const,
  effectiveFrom: '2026-09-10T00:00:00.000Z', effectiveUntil: '2026-10-10T00:00:00.000Z',
  portalCreationEnabled: false, allowedModules: ['business-content', 'bookings', 'enquiries'],
  siteLimit: 1, pagesPerSiteLimit: 15, storageBytesLimit: 1073741824, domainLimit: 0,
  aiOperationLimit: 100, buildLimit: 30, trafficBytesLimit: 10737418240,
  reason: 'Internal client website build period'
}
const receipt = { id: '40000000-0000-4000-8000-000000000901', clientId: body.clientId, tenantId, planKey: body.planKey, status: body.status }
const now = new Date('2026-09-10T01:00:00Z')
function database(overrides: { existing?: boolean, inactive?: boolean, audit?: unknown, auditFails?: boolean } = {}) {
  const query = vi.fn(async (sql: string, _values: unknown[] = []) => {
    if (sql.includes('FROM agency_clients')) return { rows: overrides.inactive ? [] : [{ id: body.clientId }] }
    if (sql.includes('FROM billing_entitlement_audit')) return { rows: overrides.audit ? [overrides.audit] : [] }
    if (sql.includes('FROM page_studio_entitlements')) return { rows: overrides.existing ? [{ id: receipt.id }] : [] }
    if (sql.includes('INSERT INTO page_studio_entitlements')) return { rows: [receipt] }
    if (sql.includes('INSERT INTO billing_entitlement_audit') && overrides.auditFails) throw new Error('Audit unavailable')
    return { rows: [] }
  })
  const transaction = vi.fn(async <T>(callback: (db: PageStudioQueryClient) => Promise<T>) => callback({ query } as PageStudioQueryClient))
  return { query, transaction }
}

describe('Page Studio entitlement grants', () => {
  it('creates the explicit limits and audit within the same transaction', async () => {
    const db = database()
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, now)).resolves.toEqual({ entitlement: receipt, replayed: false })
    expect(db.transaction).toHaveBeenCalledOnce()
    const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO page_studio_entitlements'))!
    expect(insert[1]).toContain(tenantId)
    expect(insert[1]).toContain(body.clientId)
    expect(insert[1]).toContain(actorId)
    expect(insert[1]).toContain(body.pagesPerSiteLimit)
    const audit = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO billing_entitlement_audit'))!
    expect(audit[1]).toContain(actorId)
    expect(audit[1]).toContain(body.clientId)
    expect(JSON.stringify(audit[1])).toContain(body.requestId)
  })

  it.each([
    { status: 'trial', effectiveUntil: null },
    { effectiveUntil: body.effectiveFrom },
    { siteLimit: -1 }, { buildLimit: 0.5 }, { storageBytesLimit: Number.MAX_SAFE_INTEGER + 1 },
    { allowedModules: ['business-content', 'arbitrary-runtime'] },
    { allowedModules: ['bookings'] }, { tenantId: 'forged-tenant' }, { reason: '' }
  ])('rejects invalid or ambiguous access terms before SQL: %j', async (change) => {
    const db = database()
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body: { ...body, ...change } }, db.transaction, now)).rejects.toMatchObject({ statusCode: 400 })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('denies missing or inactive clients before writing', async () => {
    const db = database({ inactive: true })
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, now)).rejects.toMatchObject({ statusCode: 404 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false)
  })

  it('does not replace an existing suspended, expired or active subscription', async () => {
    const db = database({ existing: true })
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false)
  })

  it('replays the original receipt even after its trial expires', async () => {
    const db = database({ existing: true, audit: { actor_id: actorId, metadata: { request: PageStudioEntitlementGrantBody.parse(body), entitlement: receipt } } })
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, new Date('2026-11-01'))).resolves.toEqual({ entitlement: receipt, replayed: true })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false)
    const lookup = db.query.mock.calls.find(([sql]) => sql.includes('FROM billing_entitlement_audit'))!
    expect(lookup[1]).toEqual([body.clientId, tenantId, body.requestId])
  })

  it.each(['body', 'actor'])('rejects replay with changed %s', async (kind) => {
    const db = database({ audit: { actor_id: kind === 'actor' ? 'someone-else' : actorId, metadata: { request: PageStudioEntitlementGrantBody.parse(kind === 'body' ? { ...body, siteLimit: 2 } : body), entitlement: receipt } } })
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false)
  })

  it('rejects a new grant whose access period already ended', async () => {
    const db = database()
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, new Date('2026-11-01'))).rejects.toMatchObject({ statusCode: 400 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false)
  })

  it('propagates audit failure so the transaction rolls back the grant', async () => {
    const db = database({ auditFails: true })
    await expect(grantPageStudioEntitlement({ actorId, tenantId, body }, db.transaction, now)).rejects.toThrow('Audit unavailable')
  })
})
