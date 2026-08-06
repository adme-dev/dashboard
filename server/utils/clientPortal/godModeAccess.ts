import { createHash } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getCookie, getHeader, readBody } from 'h3'

import { transaction, transactionWithoutRetry } from '~~/server/utils/db'
import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const ROUTE = '/api/agency/client-portal/access'
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const AGENCY_WIDE_ROLES = new Set(['owner', 'admin', 'lead', 'project_manager'])
const coordinationKey = Symbol('godModeClientPortalAccess')

type TransactionDb = Pick<Pool, 'query'>

export interface AgencyPortalAccessActor {
  id: string
  email: string
  name?: string | null
  role: string
}

export interface ClientPortalAccessResult {
  sessionToken: string
  sessionId: string
  expiresAt: string
  client: {
    id: string
    name: string
    logoUrl: string | null
  }
  user: {
    id: string
    email: string
    name: string
    status: string
    agencyAccess: true
  }
}

interface PortalAccessRow {
  sessionId: string
  expiresAt: string | Date
  clientId: string
  clientName: string
  logoUrl: string | null
  userId: string
  userEmail: string
  userName: string
  userStatus: string
}

interface ExistingExecutionRow {
  state: string
  result_reference: string | null
  route_or_tool: string
  request_digest: string | null
  client_id: string | null
}

interface Coordination {
  db: TransactionDb
  actorUserId: string
  clientId: string
  idempotencyKey: string
  requestDigest: string
  sessionToken: string
  mode: 'execute' | 'replay'
  resultReference: string | null
  mutationSettled: boolean
  savepointOpen: boolean
  finish: (terminal: GodModeAuditEventInput) => Promise<void>
}

export interface GodModeClientPortalAccessDependencies {
  transaction: typeof transactionWithoutRetry
  ordinaryTransaction: typeof transaction
  appendAudit: typeof appendGodModeAuditEvent
  readRequestBody: (event: H3Event) => Promise<{ clientId?: unknown }>
  digestRequest: (event: H3Event) => Promise<string>
  deriveSessionToken: (event: H3Event, actorUserId: string, clientId: string, idempotencyKey: string) => Promise<string>
  randomSessionToken: () => string
}

function sessionCredential(event: H3Event): string | null {
  const cookieToken = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
  const authorization = getHeader(event, 'authorization')
  return cookieToken || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

async function derivePortalSessionToken(
  event: H3Event,
  actorUserId: string,
  clientId: string,
  idempotencyKey: string
): Promise<string> {
  const credential = sessionCredential(event)
  if (!credential) throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(credential),
    { name: 'HMAC', hash: 'SHA-384' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`xeroflow:client-portal-access:v1\u0000${actorUserId}\u0000${clientId}\u0000${idempotencyKey}`)
  )
  return base64Url(new Uint8Array(signature))
}

const defaultDependencies: GodModeClientPortalAccessDependencies = {
  transaction: transactionWithoutRetry,
  ordinaryTransaction: transaction,
  appendAudit: appendGodModeAuditEvent,
  readRequestBody: async event => await readBody<{ clientId?: unknown }>(event),
  digestRequest: async event => await digestMcpRequestBody(await readBody(event)),
  deriveSessionToken: derivePortalSessionToken,
  randomSessionToken: () => base64Url(crypto.getRandomValues(new Uint8Array(48)))
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function coordination(event: H3Event): Coordination | null {
  return ((event.context as Record<PropertyKey, unknown> | undefined)?.[coordinationKey] as Coordination | undefined) ?? null
}

function accessEmail(actorUserId: string, clientId: string): string {
  return `agency-${actorUserId}-${clientId}@portal-access.local`.toLowerCase()
}

function toResult(row: PortalAccessRow, sessionToken: string): ClientPortalAccessResult {
  return {
    sessionToken,
    sessionId: row.sessionId,
    expiresAt: new Date(row.expiresAt).toISOString(),
    client: {
      id: row.clientId,
      name: row.clientName,
      logoUrl: row.logoUrl
    },
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      status: row.userStatus,
      agencyAccess: true
    }
  }
}

async function replayPortalAccess(
  db: TransactionDb,
  current: Coordination,
  actor: AgencyPortalAccessActor,
  tokenHash: string
): Promise<ClientPortalAccessResult> {
  const replay = await db.query<PortalAccessRow>(`
    SELECT
      session.id AS "sessionId",
      session.expires_at AS "expiresAt",
      client.id AS "clientId",
      client.name AS "clientName",
      client.logo_url AS "logoUrl",
      portal_user.id AS "userId",
      portal_user.email AS "userEmail",
      portal_user.name AS "userName",
      portal_user.status AS "userStatus"
    FROM client_sessions session
    INNER JOIN client_users portal_user ON portal_user.id = session.client_user_id
    INNER JOIN agency_clients client ON client.id = portal_user.client_id
    WHERE session.id = $1
      AND portal_user.client_id = $2
      AND portal_user.email = $3
      AND session.token_hash = $4
      AND session.expires_at > NOW()
    LIMIT 1
  `, [current.resultReference, current.clientId, accessEmail(actor.id, current.clientId), tokenHash])
  const row = replay.rows[0]
  if (!row) {
    throw createError({ statusCode: 409, statusMessage: 'Portal access replay is no longer available' })
  }
  return toResult(row, current.sessionToken)
}

async function createPortalAccess(
  db: TransactionDb,
  actor: AgencyPortalAccessActor,
  clientId: string,
  sessionToken: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<ClientPortalAccessResult> {
  const agencyWide = AGENCY_WIDE_ROLES.has(actor.role)
  const clientResult = await db.query<{ id: string, name: string, logoUrl: string | null }>(`
    SELECT client.id, client.name, client.logo_url AS "logoUrl"
    FROM agency_clients client
    WHERE client.id = $1
      AND (
        $3::BOOLEAN
        OR EXISTS (
          SELECT 1
          FROM client_team_assignments assignment
          WHERE assignment.client_id = client.id
            AND assignment.team_member_id = $2
        )
      )
    LIMIT 1
  `, [clientId, actor.id, agencyWide])
  const client = clientResult.rows[0]
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  const email = accessEmail(actor.id, client.id)
  const displayName = `${actor.name || actor.email} (Agency)`
  const tokenHash = await digestPortalSessionToken(sessionToken)
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)

  const upsertResult = await db.query<{ id: string, email: string, name: string, status: string }>(`
    INSERT INTO client_users (
      client_id, email, name, title, role, status, email_verified, email_verified_at,
      invited_by, activated_at, can_view_projects, can_view_invoices, can_approve_work,
      can_view_time_entries, can_view_budgets, can_add_comments, can_upload_files,
      can_invite_users, can_view_analytics, can_submit_requests
    ) VALUES (
      $1, $2, $3, 'Agency portal access', 'viewer', 'active', true, NOW(), $4, NOW(),
      true, true, false, true, true, false, false, false, true, false
    )
    ON CONFLICT (client_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      title = EXCLUDED.title,
      status = 'active',
      email_verified = true,
      email_verified_at = COALESCE(client_users.email_verified_at, NOW()),
      invited_by = EXCLUDED.invited_by,
      can_view_projects = true,
      can_view_invoices = true,
      can_approve_work = false,
      can_view_time_entries = true,
      can_view_budgets = true,
      can_add_comments = false,
      can_upload_files = false,
      can_invite_users = false,
      can_view_analytics = true,
      can_submit_requests = false,
      updated_at = NOW()
    RETURNING id, email, name, status
  `, [client.id, email, displayName, actor.id])
  const user = upsertResult.rows[0]
  if (!user) throw new Error('Failed to create agency portal user')

  const sessionResult = await db.query<{ id: string }>(`
    INSERT INTO client_sessions (client_user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [user.id, tokenHash, ipAddress, userAgent, expiresAt.toISOString()])
  const session = sessionResult.rows[0]
  if (!session) throw new Error('Failed to create agency portal session')

  await db.query(`
    UPDATE client_users
    SET last_login_at = NOW(), login_count = login_count + 1
    WHERE id = $1
  `, [user.id])

  await db.query(`
    INSERT INTO client_activity_log (
      client_user_id, client_id, action, entity_type, entity_id, details, ip_address, user_agent
    ) VALUES ($1, $2, 'agency_portal_access', 'client', $2, $3, $4, $5)
  `, [
    user.id,
    client.id,
    JSON.stringify({
      agencyUserId: actor.id,
      agencyUserEmail: actor.email,
      agencyUserRole: actor.role
    }),
    ipAddress,
    userAgent
  ])

  return toResult({
    sessionId: session.id,
    expiresAt,
    clientId: client.id,
    clientName: client.name,
    logoUrl: client.logoUrl,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    userStatus: user.status
  }, sessionToken)
}

export async function prepareGodModeClientPortalAccess(
  event: H3Event,
  dependencies: GodModeClientPortalAccessDependencies = defaultDependencies
): Promise<{
  strategy: 'transaction-bound'
  prepared: true
  persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void>
}> {
  const state = getGodModeRouteAuditState(event)
  const idempotencyKey = getHeader(event, 'idempotency-key')?.trim() || ''
  if (!state) throw new Error('God mode route attempt is unavailable')
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw createError({
      statusCode: 428,
      statusMessage: 'A stable Idempotency-Key header is required for God mode client portal access'
    })
  }
  const body = await dependencies.readRequestBody(event)
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const requestDigest = await dependencies.digestRequest(event)
  const sessionToken = await dependencies.deriveSessionToken(
    event,
    state.actorUserId,
    clientId,
    idempotencyKey
  )

  const ready = deferred<Coordination>()
  const terminal = deferred<GodModeAuditEventInput>()
  let readySettled = false

  const transactionPromise = dependencies.transaction(async (db) => {
    const claimed = await db.query(
      `INSERT INTO god_mode_execution_ledger (
        actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
        executor_class, session_digest, client_id, execution_phase, execution_metadata
      ) VALUES (
        $1, 'application', $2, 'in_progress', $3, $4,
        'local-transactional', $5,
        CASE WHEN $6 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN $6::UUID ELSE NULL END,
        'claimed', jsonb_build_object('requestDigest', $7::TEXT)
      )
      ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
      RETURNING state`,
      [state.actorUserId, idempotencyKey, state.correlationId, state.routeOrTool, state.sessionDigest, clientId, requestDigest]
    )

    let mode: Coordination['mode'] = 'execute'
    let resultReference: string | null = null
    if (!claimed.rows[0]) {
      const existing = await db.query<ExistingExecutionRow>(`
        SELECT
          state,
          result_reference,
          route_or_tool,
          client_id::TEXT,
          execution_metadata ->> 'requestDigest' AS request_digest
        FROM god_mode_execution_ledger
        WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2
        FOR UPDATE
      `, [state.actorUserId, idempotencyKey])
      const row = existing.rows[0]
      if (!row || row.route_or_tool !== state.routeOrTool) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key belongs to another operation' })
      }
      if (row.request_digest !== requestDigest || (row.client_id && row.client_id !== clientId)) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key request does not match' })
      }
      if (row.state !== 'succeeded' || !row.result_reference) {
        throw createError({ statusCode: 409, statusMessage: 'Client portal access is not safely replayable' })
      }
      mode = 'replay'
      resultReference = row.result_reference
    }

    const current: Coordination = {
      db,
      actorUserId: state.actorUserId,
      clientId,
      idempotencyKey,
      requestDigest,
      sessionToken,
      mode,
      resultReference,
      mutationSettled: false,
      savepointOpen: false,
      finish: async () => undefined
    }
    ;(event.context as Record<PropertyKey, unknown>)[coordinationKey] = current
    readySettled = true
    ready.resolve(current)

    const finalEvent = await terminal.promise
    if (finalEvent.phase === 'succeeded' && (!current.mutationSettled || !current.resultReference)) {
      throw new Error('Client portal access did not produce a durable session')
    }

    if (current.mode === 'execute' && current.savepointOpen) {
      if (finalEvent.phase === 'succeeded') {
        await db.query('RELEASE SAVEPOINT god_mode_client_portal_access')
      } else {
        await db.query('ROLLBACK TO SAVEPOINT god_mode_client_portal_access')
        await db.query('RELEASE SAVEPOINT god_mode_client_portal_access')
        current.resultReference = null
        current.mutationSettled = false
      }
      current.savepointOpen = false
    }

    if (current.mode === 'execute') {
      const resultDigest = current.resultReference
        ? createHash('sha256').update(current.resultReference).digest('hex')
        : null
      await db.query(
        `UPDATE god_mode_execution_ledger
         SET state = $3,
             result_reference = $4,
             result_digest = $5,
             execution_phase = CASE WHEN $3 = 'succeeded' THEN 'result_captured' ELSE execution_phase END,
             updated_at = NOW()
         WHERE actor_user_id = $1 AND channel = 'application' AND idempotency_key = $2`,
        [
          current.actorUserId,
          current.idempotencyKey,
          finalEvent.phase === 'succeeded' ? 'succeeded' : 'failed',
          finalEvent.phase === 'succeeded' ? current.resultReference : null,
          finalEvent.phase === 'succeeded' ? resultDigest : null
        ]
      )
    }
    await dependencies.appendAudit(finalEvent, db)
  })
  transactionPromise.catch((error) => {
    if (!readySettled) ready.reject(error)
  })

  const current = await ready.promise
  current.finish = async (finalEvent) => {
    terminal.resolve(finalEvent)
    await transactionPromise
  }

  return {
    strategy: 'transaction-bound',
    prepared: true,
    persistTerminal: current.finish
  }
}

export async function executeClientPortalAccess(
  event: H3Event,
  actor: AgencyPortalAccessActor,
  clientId: string,
  ipAddress: string | null,
  userAgent: string | null,
  dependencies: Pick<GodModeClientPortalAccessDependencies, 'ordinaryTransaction' | 'randomSessionToken'> = defaultDependencies
): Promise<ClientPortalAccessResult> {
  const current = coordination(event)
  if (!current) {
    const sessionToken = dependencies.randomSessionToken()
    return await dependencies.ordinaryTransaction(async db => await createPortalAccess(
      db,
      actor,
      clientId,
      sessionToken,
      ipAddress,
      userAgent
    ))
  }

  if (current.actorUserId !== actor.id || current.clientId !== clientId) {
    throw createError({ statusCode: 409, statusMessage: 'Client portal access scope does not match' })
  }

  const tokenHash = await digestPortalSessionToken(current.sessionToken)
  await current.db.query('SAVEPOINT god_mode_client_portal_access')
  current.savepointOpen = true
  try {
    const result = current.mode === 'replay'
      ? await replayPortalAccess(current.db, current, actor, tokenHash)
      : await createPortalAccess(current.db, actor, clientId, current.sessionToken, ipAddress, userAgent)
    if (current.mode === 'execute') current.resultReference = result.sessionId
    current.mutationSettled = true
    if (current.mode === 'replay') {
      await current.db.query('RELEASE SAVEPOINT god_mode_client_portal_access')
      current.savepointOpen = false
    }
    return result
  } catch (error) {
    await current.db.query('ROLLBACK TO SAVEPOINT god_mode_client_portal_access')
    await current.db.query('RELEASE SAVEPOINT god_mode_client_portal_access')
    current.savepointOpen = false
    throw error
  }
}

export function registerGodModeClientPortalAccessFamily(
  dependencies: GodModeClientPortalAccessDependencies = defaultDependencies
): () => void {
  return registerGodModeMutationFamily({
    family: 'client-portal-access',
    method: 'POST',
    matchesPath: path => path === ROUTE,
    prepare: event => prepareGodModeClientPortalAccess(event, dependencies)
  })
}
