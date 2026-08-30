import { describe, expect, it, vi } from 'vitest'
import {
  createPageStudioSite,
  type PageStudioQueryClient,
  type PageStudioSiteError
} from '~~/server/utils/pageStudio/sites'

const SITE_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ENTITLEMENT_ID = '44444444-4444-4444-8444-444444444444'

function database(respond: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({
    rows: respond(sql, params)
  }))
  const client = { query } as PageStudioQueryClient
  const runTransaction = vi.fn(async <T>(callback: (db: PageStudioQueryClient) => Promise<T>) => callback(client))
  return { client, query, runTransaction }
}

function successfulRows(sql: string): unknown[] {
  if (sql.includes('FROM page_studio_entitlements')) {
    return [{
      id: ENTITLEMENT_ID,
      active_site_limit: 1,
      portal_creation_enabled: true
    }]
  }
  if (sql.includes('COUNT(*)')) return [{ active_site_count: '0' }]
  if (sql.includes('FROM agency_clients')) return [{ id: CLIENT_ID }]
  if (sql.includes('FROM client_users')) return []
  if (sql.includes('INSERT INTO page_studio_sites')) {
    return [{
      id: SITE_ID,
      tenant_id: 'tenant-alpha',
      client_id: CLIENT_ID,
      entitlement_id: ENTITLEMENT_ID,
      name: 'Spring campaign',
      route: 'spring-campaign',
      starter_version: 'automotive-campaign-v1',
      status: 'draft',
      created_at: '2026-08-30T01:00:00.000Z',
      updated_at: '2026-08-30T01:00:00.000Z'
    }]
  }
  return []
}

describe('createPageStudioSite', () => {
  it('atomically consumes entitlement capacity and appends an audit event', async () => {
    const db = database(sql => successfulRows(sql))

    await expect(createPageStudioSite({
      actorId: ACTOR_ID,
      actorRole: 'agency',
      clientId: CLIENT_ID,
      name: 'Spring campaign',
      route: 'spring-campaign',
      starterVersion: 'automotive-campaign-v1',
      tenantId: 'tenant-alpha'
    }, { runTransaction: db.runTransaction })).resolves.toMatchObject({
      id: SITE_ID,
      clientId: CLIENT_ID,
      route: 'spring-campaign',
      status: 'draft'
    })

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'tenant-alpha',
      CLIENT_ID
    ])
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['site.created', SITE_ID, ACTOR_ID])
    )
  })

  it('rejects creation before inserting a site when the entitlement is exhausted', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_entitlements')) {
        return [{ id: ENTITLEMENT_ID, active_site_limit: 1, portal_creation_enabled: true }]
      }
      if (sql.includes('COUNT(*)')) return [{ active_site_count: '1' }]
      return successfulRows(sql)
    })

    await expect(createPageStudioSite({
      actorId: ACTOR_ID,
      actorRole: 'agency',
      clientId: CLIENT_ID,
      name: 'Second site',
      route: 'second-site',
      starterVersion: 'automotive-campaign-v1',
      tenantId: 'tenant-alpha'
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject<Partial<PageStudioSiteError>>({
      code: 'ENTITLEMENT_LIMIT_REACHED',
      statusCode: 409
    })

    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_sites'))).toBe(false)
  })

  it('fails closed when the client has no entitlement in the selected tenant', async () => {
    const db = database(sql => sql.includes('FROM page_studio_entitlements') ? [] : successfulRows(sql))

    await expect(createPageStudioSite({
      actorId: ACTOR_ID,
      actorRole: 'agency',
      clientId: CLIENT_ID,
      name: 'Unentitled site',
      route: 'unentitled-site',
      starterVersion: 'automotive-campaign-v1',
      tenantId: 'tenant-other'
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      statusCode: 403
    })
  })

  it('creates an editor membership only for the authenticated portal client', async () => {
    const portalUserId = '55555555-5555-4555-8555-555555555555'
    const db = database((sql) => {
      if (sql.includes('FROM client_users')) return [{ id: portalUserId }]
      return successfulRows(sql)
    })

    await createPageStudioSite({
      actorId: portalUserId,
      actorRole: 'client',
      clientId: CLIENT_ID,
      name: 'Client site',
      portalUserId,
      route: 'client-site',
      starterVersion: 'automotive-campaign-v1',
      tenantId: 'tenant-alpha'
    }, { runTransaction: db.runTransaction })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_site_memberships'),
      ['tenant-alpha', CLIENT_ID, SITE_ID, portalUserId]
    )
  })

  it('rejects client creation when portal creation is disabled by the subscription', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_entitlements')) {
        return [{ id: ENTITLEMENT_ID, active_site_limit: 1, portal_creation_enabled: false }]
      }
      return successfulRows(sql)
    })

    await expect(createPageStudioSite({
      actorId: ACTOR_ID,
      actorRole: 'client',
      clientId: CLIENT_ID,
      name: 'Client site',
      portalUserId: ACTOR_ID,
      route: 'client-site',
      starterVersion: 'automotive-campaign-v1',
      tenantId: 'tenant-alpha'
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'PORTAL_CREATION_DISABLED',
      statusCode: 403
    })
  })
})
