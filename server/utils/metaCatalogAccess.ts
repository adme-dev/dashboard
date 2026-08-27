import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import {
  getMetaProductCatalog,
  listMetaBusinesses,
  type MetaBusiness,
  type MetaProductCatalog,
} from '~~/server/utils/metaCatalogClient'

export interface MetaCatalogConnection {
  id: string
  accountId: string
  accountName: string
  accessToken: string
  tokenExpiresAt: string | null
  scopes: string[]
  businesses: MetaBusiness[]
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
    metadata: unknown
  }>(
    `SELECT id, account_id, account_name, access_token, token_expires_at, scopes, metadata
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
    businesses: normalizeBusinesses(row.metadata),
  }
}

function normalizeBusinesses(metadata: unknown): MetaBusiness[] {
  let value = metadata
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!value || typeof value !== 'object') return []
  const businesses = (value as { businesses?: unknown }).businesses
  if (!Array.isArray(businesses)) return []
  return businesses
    .filter((business): business is { id: unknown, name?: unknown } => Boolean(
      business && typeof business === 'object' && (business as { id?: unknown }).id,
    ))
    .map(business => ({
      id: String(business.id),
      name: String(business.name || business.id),
    }))
}

export async function listAccessibleMetaBusinesses(
  connection: MetaCatalogConnection,
): Promise<MetaBusiness[]> {
  const liveBusinesses = await listMetaBusinesses(connection.accessToken)
  const businesses = new Map<string, MetaBusiness>()
  for (const business of [...connection.businesses, ...liveBusinesses]) {
    businesses.set(business.id, business)
  }
  return [...businesses.values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
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
    listAccessibleMetaBusinesses(connection),
  ])
  if (!catalog.businessId || !businesses.some(business => business.id === catalog.businessId)) {
    throw createError({ statusCode: 403, statusMessage: 'This catalog is not owned by an accessible Meta Business.' })
  }
  return catalog
}
