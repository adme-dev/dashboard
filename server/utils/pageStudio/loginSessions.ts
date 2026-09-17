import type { H3Event } from 'h3'
import { createError, getCookie, getHeader } from 'h3'
import { verifyJwt } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import type { PageStudioSessionQueryClient } from './sessions'

type Role = 'agency' | 'client'
export interface PageStudioLoginSession {
  role: Role
  tokenHash: string
  userId: string
  issuedAt: Date
  expiresAt: Date
}

function loginToken(event: H3Event, role: Role): string | undefined {
  const cookie = role === 'agency'
    ? getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
    : getCookie(event, 'client_session_token')
  const header = getHeader(event, 'authorization')
  const token = cookie || (header?.startsWith('Bearer ') ? header.slice(7) : undefined)
  return token && token.length <= 8192 ? token : undefined
}

async function agencyLogin(token: string, allowAlias = false): Promise<PageStudioLoginSession | null> {
  const parts = token.split('.')
  let canonical: string
  try {
    canonical = parts.slice(0, 2).map(part => btoa(atob(part))).join('.')
    if (parts.length < 2 || (!allowAlias && token !== canonical)) return null
  } catch { return null }
  const claims = await verifyJwt(canonical)
  if (!claims || typeof claims.userId !== 'string' || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now()
    || claims.iat > Date.now() || claims.exp <= claims.iat) return null
  return { role: 'agency', userId: claims.userId, tokenHash: await digestPortalSessionToken(canonical),
    issuedAt: new Date(claims.iat), expiresAt: new Date(claims.exp) }
}

export async function resolvePageStudioLoginSession(
  db: PageStudioSessionQueryClient, event: H3Event | undefined, role: Role, userId: string
): Promise<PageStudioLoginSession> {
  const token = event && loginToken(event, role)
  let login: PageStudioLoginSession | null = null
  if (token && role === 'agency') login = await agencyLogin(token)
  if (token && role === 'client') {
    const tokenHash = await digestPortalSessionToken(token)
    // Same native-session → login-row lock order as portal logout.
    const row = (await db.query<{ expires_at: Date }>(`SELECT expires_at FROM client_sessions
      WHERE token_hash=$1 AND client_user_id=$2 AND expires_at>NOW() FOR SHARE`, [tokenHash, userId])).rows[0]
    if (row) login = { role, tokenHash, userId, issuedAt: new Date(), expiresAt: new Date(row.expires_at) }
  }
  if (!login || login.userId !== userId) throw createError({ statusCode: 401, statusMessage: 'Sign in again before opening Studio' })
  return login
}

export async function bindPageStudioLoginSession(db: PageStudioSessionQueryClient, login: PageStudioLoginSession): Promise<void> {
  // Conflict updates acquire the same row lock as logout, without ever clearing
  // its tombstone. A logout before the first launch must also block later issuance.
  const row = (await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(role,token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash
    WHERE page_studio_login_sessions.revoked_at IS NULL AND page_studio_login_sessions.expires_at>NOW()
      AND page_studio_login_sessions.user_id=EXCLUDED.user_id RETURNING token_hash`,
  [login.role, login.tokenHash, login.userId, login.issuedAt, login.expiresAt])).rows[0]
  if (!row) throw createError({ statusCode: 401, statusMessage: 'Sign in again before opening Studio' })
}

export async function revokePageStudioLoginSession(event: H3Event, role: Role): Promise<void> {
  const cookies = role === 'agency'
    ? [getCookie(event, 'auth_token'), getCookie(event, 'auth_token_client')].filter((token): token is string => Boolean(token))
    : []
  const tokens = [...new Set(cookies.length ? cookies : [loginToken(event, role)])]
    .filter((token): token is string => Boolean(token && token.length <= 8192))
  if (!tokens.length) return
  const entries = await Promise.all(tokens.map(async (token) => {
    // Normal auth accepts legacy encodings; logout must revoke their canonical
    // login too. New Studio issuance requires the canonical form.
    const login = role === 'agency' ? await agencyLogin(token, true) : null
    return { tokenHash: login?.tokenHash ?? await digestPortalSessionToken(token), login }
  }))
  if (role === 'agency' && entries.every(entry => !entry.login)) return
  try {
    await transaction(async (db) => {
      for (const { login, tokenHash } of entries.sort((a, b) => a.tokenHash.localeCompare(b.tokenHash))) {
        if (role === 'agency' && !login) continue
        if (login) {
          await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at,revoked_at)
            VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(role,token_hash) DO UPDATE SET revoked_at=COALESCE(page_studio_login_sessions.revoked_at,NOW())`,
          [role, tokenHash, login.userId, login.issuedAt, login.expiresAt])
        } else {
          await db.query('DELETE FROM client_sessions WHERE token_hash=$1', [tokenHash])
          await db.query('UPDATE page_studio_login_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE role=$1 AND token_hash=$2', [role, tokenHash])
        }
        await db.query(`WITH revoked AS (
          UPDATE page_studio_sessions SET revoked_at=NOW()
          WHERE role=$1 AND login_session_hash=$2 AND revoked_at IS NULL RETURNING *)
          INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
          SELECT tenant_id,client_id,site_id,user_id,role,'session.revoked','session',nonce,'{"reason":"login_logout"}'::jsonb FROM revoked`, [role, tokenHash])
      }
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Sign out could not be completed. Please try again.' })
  }
}
