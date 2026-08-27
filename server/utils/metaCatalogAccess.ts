import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import {
  getMetaProductCatalog,
  listMetaBusinesses,
  type MetaProductCatalog,
} from '~~/server/utils/metaCatalogClient'

export interface MetaCatalogConnection {
  id: string
  accountId: string
  accountName: string
  accessToken: string
  tokenExpiresAt: string | null
  scopes: string[]
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {}
  return value
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(',')
    .map(scope => scope.replace(/^"|"$/g, '').trim())
    .filter(Boolean)
}

export async function loadMetaCatalogConnection(connectionId: string): Promise<MetaCatalogConnection> {
  const row = await queryOne<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    token_expires_at: string | Date | null
    scopes: unknown
  }>(
    `SELECT id, account_id, account_name, access_token, token_expires_at, scopes
     FROM social_connections
     WHERE id = $1 AND platform = 'meta' AND status = 'active'`,
    [connectionId],
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Active Meta connection not found.' })
  }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 401, statusMessage: 'The Meta access token has expired. Reconnect Meta to continue.' })
  }

  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    accessToken: row.access_token,
    tokenExpiresAt: expiresAt?.toISOString() || null,
    scopes: normalizeScopes(row.scopes),
  }
}

export function requireMetaCatalogScope(connection: MetaCatalogConnection): void {
  const missing = ['business_management', 'catalog_management']
    .filter(scope => !connection.scopes.includes(scope))
  if (missing.length) {
    throw createError({
      statusCode: 403,
      statusMessage: `Meta catalog access is not granted. Reconnect Meta and approve ${missing.join(' and ')}.`,
    })
  }
}

export async function requireOwnedMetaCatalog(
  connection: MetaCatalogConnection,
  catalogId: string,
): Promise<MetaProductCatalog> {
  requireMetaCatalogScope(connection)
  const [catalog, businesses] = await Promise.all([
    getMetaProductCatalog(catalogId, connection.accessToken),
    listMetaBusinesses(connection.accessToken),
  ])
  if (!catalog.businessId || !businesses.some(business => business.id === catalog.businessId)) {
    throw createError({ statusCode: 403, statusMessage: 'This catalog is not owned by an accessible Meta Business.' })
  }
  return catalog
}
