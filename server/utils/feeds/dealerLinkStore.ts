import { queryOne as dbQueryOne, queryRows as dbQueryRows } from '~~/server/utils/db'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './constants'

type QueryOne = typeof dbQueryOne
type QueryRows = typeof dbQueryRows

export interface DealerLinkInput {
  clientId: string
  providerId?: string
  externalOrgId: string
  sellerRefs?: unknown
  defaultFeedIds?: unknown
  status?: string
}

export interface DealerLinkRecord {
  id: string
  clientId: string
  clientName: string | null
  providerId: string
  externalOrgId: string
  sellerRefs: string[]
  defaultFeedIds: string[]
  status: string
  createdAt: string
  updatedAt: string
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(nonEmpty).filter(Boolean)))
}

function assertPresent(name: string, value: string) {
  if (!value) throw new Error(`${name} is required`)
}

export function normalizeDealerLinkInput(input: DealerLinkInput): Required<DealerLinkInput> {
  const clientId = nonEmpty(input.clientId)
  const providerId = nonEmpty(input.providerId) || SOCIAL_DASHBOARD_PROVIDER_ID
  const externalOrgId = nonEmpty(input.externalOrgId)
  const status = nonEmpty(input.status) || 'active'

  assertPresent('clientId', clientId)
  assertPresent('providerId', providerId)
  assertPresent('externalOrgId', externalOrgId)

  return {
    clientId,
    providerId,
    externalOrgId,
    sellerRefs: stringList(input.sellerRefs),
    defaultFeedIds: stringList(input.defaultFeedIds),
    status,
  }
}

export function rowToDealerLinkRecord(row: any): DealerLinkRecord {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    clientName: row.client_name == null ? null : String(row.client_name),
    providerId: String(row.provider_id),
    externalOrgId: String(row.external_org_id),
    sellerRefs: stringList(row.seller_refs),
    defaultFeedIds: stringList(row.default_feed_ids),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function listDealerLinks(
  deps: {
    queryRows?: QueryRows
    providerId?: string
    status?: string
    clientId?: string
  } = {},
): Promise<DealerLinkRecord[]> {
  const queryRows = deps.queryRows ?? dbQueryRows
  const providerId = nonEmpty(deps.providerId) || SOCIAL_DASHBOARD_PROVIDER_ID
  const status = nonEmpty(deps.status) || 'active'
  const clientId = nonEmpty(deps.clientId)
  const params: unknown[] = [providerId, status]
  const clientFilter = clientId ? `AND l.client_id = $${params.push(clientId)}` : ''

  const rows = await queryRows(`
    SELECT
      l.id,
      l.client_id,
      c.name AS client_name,
      l.provider_id,
      l.external_org_id,
      l.seller_refs,
      l.default_feed_ids,
      l.status,
      l.created_at,
      l.updated_at
    FROM client_feed_links l
    LEFT JOIN agency_clients c ON c.id = l.client_id
    WHERE l.provider_id = $1 AND l.status = $2
    ${clientFilter}
    ORDER BY c.name ASC NULLS LAST, l.updated_at DESC
  `, params)
  return rows.map(rowToDealerLinkRecord)
}

export async function upsertDealerLink(
  input: DealerLinkInput,
  deps: { queryOne?: QueryOne; actorId?: string | null } = {},
): Promise<DealerLinkRecord> {
  const link = normalizeDealerLinkInput(input)
  const queryOne = deps.queryOne ?? dbQueryOne
  const client = await queryOne<{ id: string }>(
    `SELECT id FROM agency_clients WHERE id = $1`,
    [link.clientId],
  )
  if (!client) throw new Error('agency client not found')

  const row = await queryOne(`
    INSERT INTO client_feed_links (
      client_id,
      provider_id,
      external_org_id,
      seller_refs,
      default_feed_ids,
      status,
      created_by
    )
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    ON CONFLICT (client_id, provider_id) DO UPDATE SET
      external_org_id = EXCLUDED.external_org_id,
      seller_refs = EXCLUDED.seller_refs,
      default_feed_ids = EXCLUDED.default_feed_ids,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING
      id,
      client_id,
      (SELECT name FROM agency_clients WHERE id = client_feed_links.client_id) AS client_name,
      provider_id,
      external_org_id,
      seller_refs,
      default_feed_ids,
      status,
      created_at,
      updated_at
  `, [
    link.clientId,
    link.providerId,
    link.externalOrgId,
    JSON.stringify(link.sellerRefs),
    JSON.stringify(link.defaultFeedIds),
    link.status,
    deps.actorId ?? null,
  ])

  if (!row) throw new Error('dealer feed link upsert failed')
  return rowToDealerLinkRecord(row)
}

export async function deactivateDealerLink(
  clientId: string,
  deps: { queryOne?: QueryOne; providerId?: string } = {},
): Promise<DealerLinkRecord> {
  const cleanClientId = nonEmpty(clientId)
  const providerId = nonEmpty(deps.providerId) || SOCIAL_DASHBOARD_PROVIDER_ID
  assertPresent('clientId', cleanClientId)

  const row = await (deps.queryOne ?? dbQueryOne)(`
    UPDATE client_feed_links
    SET status = 'inactive', updated_at = NOW()
    WHERE client_id = $1 AND provider_id = $2
    RETURNING
      id,
      client_id,
      (SELECT name FROM agency_clients WHERE id = client_feed_links.client_id) AS client_name,
      provider_id,
      external_org_id,
      seller_refs,
      default_feed_ids,
      status,
      created_at,
      updated_at
  `, [cleanClientId, providerId])

  if (!row) throw new Error('dealer feed link not found')
  return rowToDealerLinkRecord(row)
}
