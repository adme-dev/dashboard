import { createError } from 'h3'
import { queryRows as defaultQueryRows, transaction as defaultTransaction } from '~~/server/utils/db'
import {
  createCrmEmailReplyToken,
  type CreatedCrmEmailReplyToken
} from '~~/server/utils/crm/emailReplyToken'
import type { CrmEmailRouteIssuanceConfig } from '~~/server/utils/crm/emailInboundConfig'

type CrmEmailRouteStatus = 'active' | 'never_used' | 'revoked' | 'expired'

export interface CrmEmailRouteSummary {
  id: string
  label: string
  kind: 'lead_inbox'
  clientId?: string
  recipientDomain: string
  status: CrmEmailRouteStatus
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  canRotate: boolean
  canRevoke: boolean
  addressAvailable: false
}

export interface IssuedCrmEmailRoute {
  route: CrmEmailRouteSummary
  issuedAddress: string
  addressShownOnce: true
}

export interface ListCrmLeadInboxRoutesInput {
  clientId: string
  includeClientId?: boolean
}

export interface CreateCrmLeadInboxRouteInput {
  clientId: string
  label: string
  actor: { id: string, type: 'team_member' | 'client_user' }
  issuance: CrmEmailRouteIssuanceConfig
}

interface CrmEmailRouteRow {
  id: string
  client_id: string
  label: string
  route_kind: 'lead_inbox'
  recipient_domain: string
  expires_at: string | null
  last_used_at: string | null
  is_active: boolean
  created_at: string
  revoked_at: string | null
}

interface CrmEmailRouteListDependencies {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

type DbClient = Parameters<typeof defaultTransaction>[0] extends (client: infer Client) => Promise<unknown>
  ? Client
  : never

interface CrmEmailRouteCreateDependencies {
  transaction<T>(callback: (db: DbClient) => Promise<T>): Promise<T>
  createToken(input: {
    version: number
    domain: string
    secret: string
  }): Promise<CreatedCrmEmailReplyToken>
  emailConversationsEnabled(): boolean
}

type CrmEmailRouteManagementDependencies = CrmEmailRouteListDependencies & CrmEmailRouteCreateDependencies

const defaultDependencies: CrmEmailRouteListDependencies = {
  queryRows: defaultQueryRows
}

const defaultCreateDependencies: CrmEmailRouteManagementDependencies = {
  ...defaultDependencies,
  transaction: defaultTransaction,
  createToken: createCrmEmailReplyToken,
  emailConversationsEnabled: () => process.env.CRM_EMAIL_CONVERSATIONS_ENABLED === 'true'
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function statusForRoute(row: Pick<CrmEmailRouteRow, 'is_active' | 'revoked_at' | 'expires_at' | 'last_used_at'>): CrmEmailRouteStatus {
  if (!row.is_active || row.revoked_at !== null) return 'revoked'
  if (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  if (row.last_used_at === null) return 'never_used'
  return 'active'
}

export function toCrmEmailRouteSummary(
  row: CrmEmailRouteRow,
  options: { includeClientId: boolean }
): CrmEmailRouteSummary {
  const status = statusForRoute(row)
  const isRevoked = status === 'revoked'
  return {
    id: row.id,
    label: row.label,
    kind: 'lead_inbox',
    ...(options.includeClientId ? { clientId: row.client_id } : {}),
    recipientDomain: row.recipient_domain,
    status,
    createdAt: toIso(row.created_at),
    expiresAt: row.expires_at === null ? null : toIso(row.expires_at),
    lastUsedAt: row.last_used_at === null ? null : toIso(row.last_used_at),
    revokedAt: row.revoked_at === null ? null : toIso(row.revoked_at),
    canRotate: !isRevoked,
    canRevoke: !isRevoked,
    addressAvailable: false
  }
}

export async function listCrmLeadInboxRoutes(
  input: ListCrmLeadInboxRoutesInput,
  dependencies: CrmEmailRouteListDependencies = defaultDependencies
): Promise<CrmEmailRouteSummary[]> {
  const routes = await dependencies.queryRows<CrmEmailRouteRow>(`
    SELECT
      id, client_id, label, route_kind, recipient_domain,
      expires_at, last_used_at, is_active, created_at, revoked_at
    FROM crm_email_routes
    WHERE client_id = $1
      AND route_kind = 'lead_inbox'
    ORDER BY created_at DESC, id DESC
  `, [input.clientId])

  return routes.map(route => toCrmEmailRouteSummary(route, {
    includeClientId: input.includeClientId ?? true
  }))
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

async function assertTeamMemberCanManageClient(
  db: DbClient,
  clientId: string,
  actorId: string
): Promise<void> {
  const access = await db.query<{ allowed: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM team_members member
      WHERE member.id = $1
        AND member.is_active = TRUE
        AND (
          member.user_role IN ('owner', 'admin', 'lead', 'project_manager')
          OR EXISTS (
            SELECT 1 FROM client_team_assignments assignment
            WHERE assignment.client_id = $2
              AND assignment.team_member_id = member.id
          )
        )
    ) AS allowed
  `, [actorId, clientId])
  if (!access.rows[0]?.allowed) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

function assertValidLabel(label: string): string {
  const normalized = label.trim()
  if (normalized.length < 1 || normalized.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid CRM inbox label' })
  }
  return normalized
}

export async function createCrmLeadInboxRoute(
  input: CreateCrmLeadInboxRouteInput,
  dependencies: CrmEmailRouteManagementDependencies = defaultCreateDependencies
): Promise<IssuedCrmEmailRoute> {
  if (!dependencies.emailConversationsEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'CRM email conversations are disabled' })
  }
  const label = assertValidLabel(input.label)

  try {
    const issued = await dependencies.transaction(async (db) => {
      const client = await db.query<{ lead_capture_mode: string }>(`
        SELECT lead_capture_mode
        FROM agency_clients
        WHERE id = $1
        FOR UPDATE
      `, [input.clientId])
      const clientRow = client.rows[0]
      if (!clientRow) {
        throw createError({ statusCode: 404, statusMessage: 'Client not found' })
      }
      if (!['lightweight_crm', 'full_crm'].includes(clientRow.lead_capture_mode)) {
        throw createError({ statusCode: 403, statusMessage: 'Client CRM is not enabled' })
      }
      if (input.actor.type === 'team_member') {
        await assertTeamMemberCanManageClient(db, input.clientId, input.actor.id)
      }

      const activeRoute = await db.query<{ id: string }>(`
        SELECT id
        FROM crm_email_routes
        WHERE client_id = $1
          AND route_kind = 'lead_inbox'
          AND is_active = TRUE
          AND revoked_at IS NULL
        FOR UPDATE
      `, [input.clientId])
      if (activeRoute.rows[0]) {
        throw createError({ statusCode: 409, statusMessage: 'An active CRM inbox route already exists' })
      }

      const token = await dependencies.createToken({
        version: input.issuance.currentVersion,
        domain: input.issuance.domain,
        secret: input.issuance.secret
      })
      const created = await db.query<CrmEmailRouteRow>(`
        INSERT INTO crm_email_routes (
          client_id, conversation_id, route_kind, token_version,
          route_token_hash, recipient_domain, label, created_by
        ) VALUES ($1, NULL, 'lead_inbox', $2, $3, $4, $5, $6)
        RETURNING
          id, client_id, label, route_kind, recipient_domain,
          expires_at, last_used_at, is_active, created_at, revoked_at
      `, [
        input.clientId,
        input.issuance.currentVersion,
        token.routeTokenHash,
        input.issuance.domain,
        label,
        input.actor.id
      ])
      const route = created.rows[0]
      if (!route) {
        throw createError({ statusCode: 409, statusMessage: 'CRM inbox route could not be created' })
      }
      await db.query(`
        INSERT INTO crm_email_route_audits (
          route_id, client_id, actor_id, actor_type, action
        ) VALUES ($1, $2, $3, $4, 'created')
      `, [route.id, input.clientId, input.actor.id, input.actor.type])

      return {
        route: toCrmEmailRouteSummary(route, { includeClientId: true }),
        token: token.token
      }
    })

    return {
      route: issued.route,
      issuedAddress: `lead+${issued.token}@${input.issuance.domain}`,
      addressShownOnce: true
    }
  } catch (error) {
    if (postgresErrorCode(error) === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'An active CRM inbox route already exists' })
    }
    throw error
  }
}
