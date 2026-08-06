import { createHmac } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'
import type { H3Event } from 'h3'
import { createError, getCookie, getHeader } from 'h3'

import {
  CLIENT_PORTAL_ACCESS_UNREPLAYABLE_CODE,
  executeGodModeClientPortalAccess
} from '~~/server/utils/clientPortal/godModeAccess'
import { transaction } from '~~/server/utils/db'
import { getGodModeRouteAuditState } from '~~/server/utils/godMode/featureGate'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

type TransactionDb = Pick<Pool, 'query'>
const AGENCY_WIDE_ROLES = ['owner', 'admin', 'lead', 'project_manager', 'super_admin']

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
  client: { id: string, name: string, logoUrl: string | null }
  user: { id: string, email: string, name: string, status: string, agencyAccess: true }
}

interface AccessRow {
  expiresAt: string | Date
  clientName: string
  logoUrl: string | null
  userId: string
}

function email(actorId: string, clientId: string) {
  return `agency-${actorId}-${clientId}@portal-access.local`.toLowerCase()
}

function godModeSessionToken(
  event: H3Event,
  actorId: string,
  clientId: string,
  idempotencyKey: string
) {
  const authorization = getHeader(event, 'authorization')
  const credential = getCookie(event, 'auth_token')
    || getCookie(event, 'auth_token_client')
    || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : '')
  if (!credential) throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  return createHmac('sha384', credential)
    .update(`xeroflow:client-portal-access:v1\0${actorId}\0${clientId}\0${idempotencyKey}`)
    .digest('base64url')
}

function result(
  row: AccessRow,
  actor: AgencyPortalAccessActor,
  clientId: string,
  sessionId: string,
  sessionToken: string
): ClientPortalAccessResult & { id: string } {
  return {
    id: sessionId,
    sessionToken,
    sessionId,
    expiresAt: new Date(row.expiresAt).toISOString(),
    client: { id: clientId, name: row.clientName, logoUrl: row.logoUrl },
    user: {
      id: row.userId,
      email: email(actor.id, clientId),
      name: `${actor.name || actor.email} (Agency)`,
      status: 'active',
      agencyAccess: true
    }
  }
}

async function replay(
  db: TransactionDb,
  sessionId: string,
  actor: AgencyPortalAccessActor,
  clientId: string,
  sessionToken: string
) {
  const tokenHash = await digestPortalSessionToken(sessionToken)
  const row = (await db.query<AccessRow>(`SELECT s.expires_at "expiresAt",c.name "clientName",c.logo_url "logoUrl",u.id "userId"
    FROM client_sessions s JOIN client_users u ON u.id=s.client_user_id JOIN agency_clients c ON c.id=u.client_id
    WHERE s.id=$1 AND u.client_id=$2 AND u.email=$3 AND s.token_hash=$4 AND s.expires_at>NOW()`,
  [sessionId, clientId, email(actor.id, clientId), tokenHash])).rows[0]
  if (!row) {
    throw createError({
      statusCode: 409,
      statusMessage: 'God mode client portal access replay is no longer available',
      data: { code: CLIENT_PORTAL_ACCESS_UNREPLAYABLE_CODE }
    })
  }
  return result(row, actor, clientId, sessionId, sessionToken)
}

async function create(
  db: TransactionDb,
  actor: AgencyPortalAccessActor,
  clientId: string,
  sessionToken: string,
  ipAddress: string | null,
  userAgent: string | null
) {
  const client = (await db.query<{ id: string, name: string, logoUrl: string | null }>(`SELECT c.id,c.name,
    c.logo_url "logoUrl" FROM agency_clients c WHERE c.id=$1 AND ($3::BOOLEAN OR EXISTS(SELECT 1
    FROM client_team_assignments a WHERE a.client_id=c.id AND a.team_member_id=$2))`,
  [clientId, actor.id, AGENCY_WIDE_ROLES.includes(actor.role)])).rows[0]
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  const accessEmail = email(actor.id, client.id)
  const expiresAt = new Date(Date.now() + 288e5)
  const user = (await db.query<{ id: string }>(`
    INSERT INTO client_users (
      client_id, email, name, title, role, status, email_verified, email_verified_at,
      invited_by, activated_at, can_view_projects, can_view_invoices, can_approve_work,
      can_view_time_entries, can_view_budgets, can_add_comments, can_upload_files,
      can_invite_users, can_view_analytics, can_submit_requests, last_login_at, login_count
    ) VALUES (
      $1, $2, $3, 'Agency portal access', 'viewer', 'active', true, NOW(), $4, NOW(),
      true, true, false, true, true, false, false, false, true, false, NOW(), 1
    ) ON CONFLICT (client_id, email) DO UPDATE SET
      (name,title,status,email_verified,email_verified_at,invited_by,can_view_projects,can_view_invoices,
       can_approve_work,can_view_time_entries,can_view_budgets,can_add_comments,can_upload_files,
       can_invite_users,can_view_analytics,can_submit_requests,last_login_at,login_count,updated_at) =
      (EXCLUDED.name,EXCLUDED.title,'active',true,COALESCE(client_users.email_verified_at,NOW()),
       EXCLUDED.invited_by,true,true,false,true,true,false,false,false,true,false,NOW(),client_users.login_count+1,NOW())
    RETURNING id
  `, [client.id, accessEmail, `${actor.name || actor.email} (Agency)`, actor.id])).rows[0]
  if (!user) throw new Error('Failed to create agency portal user')

  const session = (await db.query<{ id: string }>(`INSERT INTO client_sessions
    (client_user_id,token_hash,ip_address,user_agent,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [user.id, await digestPortalSessionToken(sessionToken), ipAddress, userAgent, expiresAt.toISOString()])).rows[0]
  if (!session) throw new Error('Failed to create agency portal session')

  await db.query(`INSERT INTO client_activity_log
    (client_user_id,client_id,action,entity_type,entity_id,details,ip_address,user_agent)
    VALUES ($1,$2,'agency_portal_access','client',$2,$3,$4,$5)`, [
    user.id,
    client.id,
    JSON.stringify({ agencyUserId: actor.id, agencyUserEmail: actor.email, agencyUserRole: actor.role }),
    ipAddress,
    userAgent
  ])

  return result({
    expiresAt,
    clientName: client.name,
    logoUrl: client.logoUrl,
    userId: user.id
  }, actor, client.id, session.id, sessionToken)
}

export async function executeClientPortalAccess(
  event: H3Event,
  actor: AgencyPortalAccessActor,
  clientId: string,
  ipAddress: string | null,
  userAgent: string | null,
  dependencies: { ordinaryTransaction: typeof transaction, randomSessionToken: () => string } = {
    ordinaryTransaction: transaction,
    randomSessionToken: () => Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  }
): Promise<ClientPortalAccessResult> {
  const state = event.context ? getGodModeRouteAuditState(event) : null
  if (!state) {
    return await dependencies.ordinaryTransaction(db => create(
      db, actor, clientId, dependencies.randomSessionToken(), ipAddress, userAgent
    ))
  }
  if (state.actorUserId !== actor.id) {
    throw createError({ statusCode: 409, statusMessage: 'Client portal access scope does not match' })
  }
  const sessionToken = godModeSessionToken(
    event,
    state.actorUserId,
    clientId,
    getHeader(event, 'idempotency-key') || ''
  )
  return await executeGodModeClientPortalAccess(
    event,
    db => create(db, actor, clientId, sessionToken, ipAddress, userAgent),
    (db, sessionId) => replay(db, sessionId, actor, clientId, sessionToken)
  )
}
