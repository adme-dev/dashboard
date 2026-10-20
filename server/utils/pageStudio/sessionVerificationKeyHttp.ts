import { createError, getCookie, getHeader, getQuery, setHeader, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { resolvePageStudioLoginSession } from './loginSessions'

const unavailable = () => createError({ statusCode: 503 })

/** Public configuration only. Explicit deployed bindings fail closed, including
 * empty/undefined values; local fallback is used only for absent properties. */
async function publicVerificationMaterial(event: H3Event) {
  const env = event.context.cloudflare?.env
  const publicKey = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_PUBLIC_KEY')
    ? env.PAGE_STUDIO_SESSION_PUBLIC_KEY
    : process.env.PAGE_STUDIO_SESSION_PUBLIC_KEY
  const issuer = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_ISSUER')
    ? env.PAGE_STUDIO_SESSION_ISSUER
    : process.env.PAGE_STUDIO_SESSION_ISSUER
  if (typeof publicKey !== 'string' || publicKey.length > 16_384 || typeof issuer !== 'string') throw unavailable()
  // Match the session issuer policy without resolving the signing environment.
  const url = new URL(issuer)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw unavailable()
  const pem = /^-----BEGIN PUBLIC KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PUBLIC KEY-----\s*$/.exec(publicKey)
  if (!pem) throw unavailable()
  const encoded = pem[1]!.replace(/[\r\n]/g, '')
  const binary = atob(encoded)
  if (btoa(binary) !== encoded) throw unavailable()
  const der = Uint8Array.from(binary, byte => byte.charCodeAt(0))
  // SPKI import cryptographically checks the public point, algorithm and curve.
  const key = await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  if (key.type !== 'public' || key.algorithm.name !== 'ECDSA'
    || (key.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256') throw unavailable()
  // Reject DER with trailing bytes or a noncanonical encoding accepted by an importer.
  const canonical = new Uint8Array(await crypto.subtle.exportKey('spki', key))
  if (canonical.length !== der.length || canonical.some((byte, index) => byte !== der[index])) throw unavailable()
  return { publicKey, issuer, algorithm: 'ES256' as const }
}

/** Trusted operator bootstrap: no signing-key resolution, login creation,
 * entitlement changes, remote calls, or caller-selected configuration. */
export async function handleSessionVerificationKey(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (event.method !== 'GET') throw createError({ statusCode: 405 })
    if (Object.keys(getQuery(event)).length
      || (getHeader(event, 'content-length') !== undefined && getHeader(event, 'content-length') !== '0')
      || getHeader(event, 'transfer-encoding')) throw createError({ statusCode: 400 })
    // Middleware context and internal bearer delegation cannot replace the
    // original canonical staff cookie, which is verified again in this transaction.
    if (!getCookie(event, 'auth_token') && !getCookie(event, 'auth_token_client')) throw createError({ statusCode: 401 })
    const user = await requireAuth(event)
    return await transactionWithoutRetry(async (db) => {
      await requireCustomerPlanOperator(db, user.id)
      const login = await resolvePageStudioLoginSession(db, event, 'agency', user.id)
      const retained = (await db.query<{ user_id: string, revoked_at: Date | null, expires_at: Date | string }>(`
        SELECT user_id,revoked_at,expires_at FROM page_studio_login_sessions
        WHERE role='agency' AND token_hash=$1 FOR SHARE NOWAIT`, [login.tokenHash])).rows
      // An unbound genuine staff login is permitted, but an existing logout
      // tombstone or conflicting binding must never be renewed by this read.
      if (retained.length > 1 || retained.some(row => row.user_id !== user.id || row.revoked_at
        || new Date(row.expires_at).getTime() <= Date.now())) throw createError({ statusCode: 401 })
      const current = (await db.query(`SELECT id FROM team_members
        WHERE id=$1 AND (sessions_invalidated_at IS NULL OR $2::timestamptz>sessions_invalidated_at)
        FOR SHARE NOWAIT`, [user.id, login.issuedAt])).rows
      if (current.length !== 1) throw createError({ statusCode: 401 })
      return await publicVerificationMaterial(event)
    })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    throw createError({ statusCode: status && [400, 401, 403, 405].includes(status) ? status : 503,
      statusMessage: 'Page Studio verification configuration is unavailable' })
  }
}
