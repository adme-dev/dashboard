import { queryRows, transaction } from '~~/server/utils/db'

export interface PageStudioQueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>
}

export type RunPageStudioTransaction = <T>(
  callback: (db: PageStudioQueryClient) => Promise<T>
) => Promise<T>

export class PageStudioSiteError extends Error {
  constructor(
    readonly code:
      | 'CLIENT_NOT_FOUND'
      | 'ENTITLEMENT_REQUIRED'
      | 'ENTITLEMENT_LIMIT_REACHED'
      | 'PORTAL_CREATION_DISABLED'
      | 'PORTAL_USER_OUT_OF_SCOPE'
      | 'ENTITLEMENT_SCOPE_AMBIGUOUS'
      | 'SITE_ROUTE_CONFLICT',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioSiteError'
  }
}

export interface CreatePageStudioSiteInput {
  actorId: string
  actorRole: 'agency' | 'client'
  clientId: string
  name: string
  portalUserId?: string
  route: string
  starterVersion: string
  tenantId: string
}

interface EntitlementRow {
  id: string
  active_site_limit: number
  portal_creation_enabled: boolean
}

interface SiteRow {
  id: string
  tenant_id: string
  client_id: string
  entitlement_id: string
  name: string
  route: string
  starter_version: string
  status: string
  created_at: string
  updated_at: string
}

export interface PageStudioSite {
  id: string
  tenantId: string
  clientId: string
  entitlementId: string
  name: string
  route: string
  starterVersion: string
  status: string
  createdAt: string
  updatedAt: string
}

interface ListedSiteRow extends SiteRow {
  total_count: string
}

export interface PageStudioSiteList {
  items: PageStudioSite[]
  total: number
}

function mapSite(row: SiteRow): PageStudioSite {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    entitlementId: row.entitlement_id,
    name: row.name,
    route: row.route,
    starterVersion: row.starter_version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const defaultRunTransaction: RunPageStudioTransaction = async callback =>
  transaction(async db => callback(db as unknown as PageStudioQueryClient))

export async function createPageStudioSite(
  input: CreatePageStudioSiteInput,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}
): Promise<PageStudioSite> {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction

  try {
    return await runTransaction(async (db) => {
      const entitlementResult = await db.query<EntitlementRow>(
        `SELECT id, active_site_limit, portal_creation_enabled
         FROM page_studio_entitlements
         WHERE tenant_id = $1
           AND client_id = $2
           AND status IN ('trial', 'active')
           AND effective_from <= NOW()
           AND (effective_until IS NULL OR effective_until > NOW())
         FOR UPDATE`,
        [input.tenantId, input.clientId]
      )
      const entitlement = entitlementResult.rows[0]
      if (!entitlement) {
        throw new PageStudioSiteError(
          'ENTITLEMENT_REQUIRED',
          403,
          'The client does not have an active Page Studio subscription'
        )
      }
      if (input.actorRole === 'client' && !entitlement.portal_creation_enabled) {
        throw new PageStudioSiteError(
          'PORTAL_CREATION_DISABLED',
          403,
          'Client site creation is disabled for this subscription'
        )
      }

      const activeCountResult = await db.query<{ active_site_count: string }>(
        `SELECT COUNT(*)::text AS active_site_count
         FROM page_studio_sites
         WHERE tenant_id = $1
           AND client_id = $2
           AND status <> 'archived'`,
        [input.tenantId, input.clientId]
      )
      const activeSiteCount = Number(activeCountResult.rows[0]?.active_site_count ?? 0)
      if (activeSiteCount >= entitlement.active_site_limit) {
        throw new PageStudioSiteError(
          'ENTITLEMENT_LIMIT_REACHED',
          409,
          'The client has reached its active-site limit'
        )
      }

      const clientResult = await db.query<{ id: string }>(
        `SELECT id
         FROM agency_clients
         WHERE id = $1 AND is_active = TRUE
         FOR SHARE`,
        [input.clientId]
      )
      if (!clientResult.rows[0]) {
        throw new PageStudioSiteError('CLIENT_NOT_FOUND', 404, 'Client not found')
      }

      let membershipUserId = input.portalUserId
      if (membershipUserId) {
        const portalUser = await db.query<{ id: string }>(
          `SELECT id
           FROM client_users
           WHERE id = $1 AND client_id = $2 AND status = 'active'
           FOR SHARE`,
          [membershipUserId, input.clientId]
        )
        if (!portalUser.rows[0]) {
          throw new PageStudioSiteError(
            'PORTAL_USER_OUT_OF_SCOPE',
            403,
            'Portal user is outside the client scope'
          )
        }
      } else {
        const primaryContact = await db.query<{ id: string }>(
          `SELECT id
           FROM client_users
           WHERE client_id = $1
             AND status = 'active'
             AND (is_primary_contact = TRUE OR role IN ('admin', 'manager'))
           ORDER BY is_primary_contact DESC, created_at ASC
           LIMIT 1
           FOR SHARE`,
          [input.clientId]
        )
        membershipUserId = primaryContact.rows[0]?.id
      }

      const siteResult = await db.query<SiteRow>(
        `INSERT INTO page_studio_sites (
           tenant_id, client_id, entitlement_id, name, route, starter_version,
           status, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
         RETURNING id, tenant_id, client_id, entitlement_id, name, route,
                   starter_version, status, created_at, updated_at`,
        [
          input.tenantId,
          input.clientId,
          entitlement.id,
          input.name,
          input.route,
          input.starterVersion,
          input.actorRole === 'agency' ? input.actorId : null
        ]
      )
      const site = siteResult.rows[0]
      if (!site) throw new Error('Page Studio site insert returned no row')

      if (membershipUserId) {
        await db.query(
          `INSERT INTO page_studio_site_memberships (
             tenant_id, client_id, site_id, user_id, role
           )
           VALUES ($1, $2, $3, $4, 'editor')
           ON CONFLICT (site_id, user_id) DO NOTHING`,
          [input.tenantId, input.clientId, site.id, membershipUserId]
        )
      }

      await db.query(
        `INSERT INTO page_studio_audit_events (
           tenant_id, client_id, site_id, actor_id, actor_role, action,
           resource_type, resource_id, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'site', $7, $8::jsonb)`,
        [
          input.tenantId,
          input.clientId,
          site.id,
          input.actorId,
          input.actorRole,
          'site.created',
          site.id,
          JSON.stringify({ route: site.route, starterVersion: site.starter_version })
        ]
      )

      return mapSite(site)
    })
  } catch (error: unknown) {
    if (error instanceof PageStudioSiteError) throw error
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new PageStudioSiteError(
        'SITE_ROUTE_CONFLICT',
        409,
        'A Page Studio site already uses this route'
      )
    }
    throw error
  }
}

export async function resolvePortalPageStudioTenant(clientId: string): Promise<string> {
  const rows = await queryRows<{ tenant_id: string }>(
    `SELECT tenant_id
     FROM page_studio_entitlements
     WHERE client_id = $1
       AND status IN ('trial', 'active')
       AND portal_creation_enabled = TRUE
       AND effective_from <= NOW()
       AND (effective_until IS NULL OR effective_until > NOW())
     ORDER BY effective_from DESC
     LIMIT 2`,
    [clientId]
  )
  if (rows.length === 0) {
    throw new PageStudioSiteError(
      'ENTITLEMENT_REQUIRED',
      403,
      'The client does not have an active Page Studio subscription'
    )
  }
  if (rows.length > 1) {
    throw new PageStudioSiteError(
      'ENTITLEMENT_SCOPE_AMBIGUOUS',
      409,
      'The client Page Studio subscription scope is ambiguous'
    )
  }
  return rows[0]!.tenant_id
}

export async function listAgencyPageStudioSites(input: {
  tenantId: string
  clientId?: string
  status?: string
  search?: string
  limit: number
  offset: number
}): Promise<PageStudioSiteList> {
  const params: unknown[] = [input.tenantId]
  const where = ['site.tenant_id = $1']
  if (input.clientId) {
    params.push(input.clientId)
    where.push(`site.client_id = $${params.length}`)
  }
  if (input.status) {
    params.push(input.status)
    where.push(`site.status = $${params.length}`)
  }
  if (input.search) {
    params.push(`%${input.search}%`)
    where.push(`(site.name ILIKE $${params.length} OR site.route ILIKE $${params.length})`)
  }
  params.push(input.limit, input.offset)

  const rows = await queryRows<ListedSiteRow>(
    `SELECT site.id, site.tenant_id, site.client_id, site.entitlement_id,
            site.name, site.route, site.starter_version, site.status,
            site.created_at, site.updated_at,
            COUNT(*) OVER()::text AS total_count
     FROM page_studio_sites site
     WHERE ${where.join(' AND ')}
     ORDER BY site.updated_at DESC, site.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )

  return {
    items: rows.map(mapSite),
    total: Number(rows[0]?.total_count ?? 0)
  }
}

export async function listPortalPageStudioSites(input: {
  clientId: string
  userId: string
  limit: number
  offset: number
}): Promise<PageStudioSiteList> {
  const rows = await queryRows<ListedSiteRow>(
    `SELECT site.id, site.tenant_id, site.client_id, site.entitlement_id,
            site.name, site.route, site.starter_version, site.status,
            site.created_at, site.updated_at,
            COUNT(*) OVER()::text AS total_count
     FROM page_studio_sites site
     JOIN page_studio_site_memberships membership
       ON membership.tenant_id = site.tenant_id
      AND membership.client_id = site.client_id
      AND membership.site_id = site.id
     WHERE site.client_id = $1
       AND membership.user_id = $2
       AND site.status <> 'archived'
     ORDER BY site.updated_at DESC, site.id
     LIMIT $3 OFFSET $4`,
    [input.clientId, input.userId, input.limit, input.offset]
  )

  return {
    items: rows.map(mapSite),
    total: Number(rows[0]?.total_count ?? 0)
  }
}
