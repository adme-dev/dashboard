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
  actor?: { id: string, type: 'team_member' }
}

export interface CreateCrmLeadInboxRouteInput {
  clientId: string
  label: string
  actor: { id: string, type: 'team_member' | 'client_user' }
  issuance: CrmEmailRouteIssuanceConfig
}

export interface RotateCrmLeadInboxRouteInput {
  clientId: string
  routeId: string
  actor: { id: string, type: 'team_member' | 'client_user' }
  issuance: CrmEmailRouteIssuanceConfig
}

export interface RevokeCrmLeadInboxRouteInput {
  clientId: string
  routeId: string
  actor: { id: string, type: 'team_member' | 'client_user' }
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
  transaction?<T>(callback: (db: DbClient) => Promise<T>): Promise<T>
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
  queryRows: defaultQueryRows,
  transaction: defaultTransaction
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
  const listRoutes = async (
    query: (sql: string, params?: unknown[]) => Promise<CrmEmailRouteRow[]>
  ): Promise<CrmEmailRouteSummary[]> => {
    const routes = await query(`
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

  const actor = input.actor
  if (!actor) return listRoutes(dependencies.queryRows)

  const transaction = dependencies.transaction ?? defaultTransaction
  return transaction(async (db) => {
    await lockAndAuthorizeCrmClient(db, { clientId: input.clientId, actor })
    return listRoutes(async (sql: string, params?: unknown[]) => {
      const result = await db.query<CrmEmailRouteRow>(sql, params)
      return result.rows
    })
  })
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
  assertCrmEmailConversationsEnabled(dependencies)
  const label = assertValidLabel(input.label)

  try {
    const issued = await dependencies.transaction(async (db) => {
      await lockAndAuthorizeCrmClient(db, input)

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

function assertCrmEmailConversationsEnabled(
  dependencies: CrmEmailRouteManagementDependencies
): void {
  if (!dependencies.emailConversationsEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'CRM email conversations are disabled' })
  }
}

async function lockAndAuthorizeCrmClient(
  db: DbClient,
  input: {
    clientId: string
    actor: { id: string, type: 'team_member' | 'client_user' }
  }
): Promise<void> {
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
}

function routeNotFound(): ReturnType<typeof createError> {
  return createError({ statusCode: 404, statusMessage: 'CRM inbox route not found' })
}

export async function rotateCrmLeadInboxRoute(
  input: RotateCrmLeadInboxRouteInput,
  dependencies: CrmEmailRouteManagementDependencies = defaultCreateDependencies
): Promise<IssuedCrmEmailRoute> {
  assertCrmEmailConversationsEnabled(dependencies)

  const issued = await dependencies.transaction(async (db) => {
    await lockAndAuthorizeCrmClient(db, input)

    const lockedRoute = await db.query<CrmEmailRouteRow>(`
      SELECT
        id, client_id, label, route_kind, recipient_domain,
        expires_at, last_used_at, is_active, created_at, revoked_at
      FROM crm_email_routes
      WHERE id = $1
        AND client_id = $2
        AND route_kind = 'lead_inbox'
        AND is_active = TRUE
        AND revoked_at IS NULL
      FOR UPDATE
    `, [input.routeId, input.clientId])
    const oldRoute = lockedRoute.rows[0]
    if (!oldRoute) throw routeNotFound()

    const token = await dependencies.createToken({
      version: input.issuance.currentVersion,
      domain: input.issuance.domain,
      secret: input.issuance.secret
    })
    // The partial unique index permits the replacement to be inserted before
    // revoking the old route only while the replacement remains inactive.
    const replacementInsert = await db.query<CrmEmailRouteRow>(`
      INSERT INTO crm_email_routes (
        client_id, conversation_id, route_kind, token_version,
        route_token_hash, recipient_domain, label, is_active, created_by
      ) VALUES ($1, NULL, 'lead_inbox', $2, $3, $4, $5, FALSE, $6)
      RETURNING
        id, client_id, label, route_kind, recipient_domain,
        expires_at, last_used_at, is_active, created_at, revoked_at
    `, [
      input.clientId,
      input.issuance.currentVersion,
      token.routeTokenHash,
      input.issuance.domain,
      oldRoute.label,
      input.actor.id
    ])
    const replacement = replacementInsert.rows[0]
    if (!replacement) {
      throw createError({ statusCode: 409, statusMessage: 'CRM inbox route could not be rotated' })
    }

    await db.query(`
      UPDATE crm_email_routes
      SET
        is_active = FALSE,
        revoked_at = NOW(),
        revoked_by = $1,
        revoked_actor_type = $2,
        revoked_reason = 'rotated',
        replaced_by_route_id = $3,
        updated_at = NOW()
      WHERE id = $4
        AND client_id = $5
        AND route_kind = 'lead_inbox'
    `, [input.actor.id, input.actor.type, replacement.id, input.routeId, input.clientId])

    const activated = await db.query<CrmEmailRouteRow>(`
      UPDATE crm_email_routes
      SET is_active = TRUE, updated_at = NOW()
      WHERE id = $1
        AND client_id = $2
        AND route_kind = 'lead_inbox'
      RETURNING
        id, client_id, label, route_kind, recipient_domain,
        expires_at, last_used_at, is_active, created_at, revoked_at
    `, [replacement.id, input.clientId])
    const route = activated.rows[0]
    if (!route) {
      throw createError({ statusCode: 409, statusMessage: 'CRM inbox route could not be rotated' })
    }

    await db.query(`
      INSERT INTO crm_email_route_audits (
        route_id, client_id, actor_id, actor_type, action
      ) VALUES ($1, $2, $3, $4, 'rotated')
    `, [input.routeId, input.clientId, input.actor.id, input.actor.type])

    return { route: toCrmEmailRouteSummary(route, { includeClientId: true }), token: token.token }
  })

  return {
    route: issued.route,
    issuedAddress: `lead+${issued.token}@${input.issuance.domain}`,
    addressShownOnce: true
  }
}

export async function revokeCrmLeadInboxRoute(
  input: RevokeCrmLeadInboxRouteInput,
  dependencies: CrmEmailRouteManagementDependencies = defaultCreateDependencies
): Promise<{ route: CrmEmailRouteSummary }> {
  assertCrmEmailConversationsEnabled(dependencies)

  return dependencies.transaction(async (db) => {
    await lockAndAuthorizeCrmClient(db, input)

    const lockedRoute = await db.query<CrmEmailRouteRow>(`
      SELECT
        id, client_id, label, route_kind, recipient_domain,
        expires_at, last_used_at, is_active, created_at, revoked_at
      FROM crm_email_routes
      WHERE id = $1
        AND client_id = $2
        AND route_kind = 'lead_inbox'
      FOR UPDATE
    `, [input.routeId, input.clientId])
    const existingRoute = lockedRoute.rows[0]
    if (!existingRoute) throw routeNotFound()

    if (!existingRoute.is_active || existingRoute.revoked_at !== null) {
      return { route: toCrmEmailRouteSummary(existingRoute, { includeClientId: true }) }
    }

    const revoked = await db.query<CrmEmailRouteRow>(`
      UPDATE crm_email_routes
      SET
        is_active = FALSE,
        revoked_at = NOW(),
        revoked_by = $1,
        revoked_actor_type = $2,
        revoked_reason = 'revoked',
        updated_at = NOW()
      WHERE id = $3
        AND client_id = $4
        AND route_kind = 'lead_inbox'
      RETURNING
        id, client_id, label, route_kind, recipient_domain,
        expires_at, last_used_at, is_active, created_at, revoked_at
    `, [input.actor.id, input.actor.type, input.routeId, input.clientId])
    const route = revoked.rows[0]
    if (!route) throw routeNotFound()

    await db.query(`
      INSERT INTO crm_email_route_audits (
        route_id, client_id, actor_id, actor_type, action
      ) VALUES ($1, $2, $3, $4, 'revoked')
    `, [input.routeId, input.clientId, input.actor.id, input.actor.type])

    return { route: toCrmEmailRouteSummary(route, { includeClientId: true }) }
  })
}
