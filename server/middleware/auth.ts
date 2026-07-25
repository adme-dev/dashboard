import { validateSession, TransientAuthError, type User } from '../utils/auth'
import { kvGet, kvPut } from '../utils/kv'
import { resolveUserPermissions } from '../utils/roleResolver'
import { isReadOnlyRole } from '../utils/permissions'

// Routes that don't require authentication
const publicRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/magic-link',
  '/api/auth/dev-login',
  '/api/auth/xeroflow',
  '/api/admin/create-super-admin',
  '/api/admin/magic-link-debug',
  '/api/test/cookies',
  '/api/webhooks',
  // Client portal — has its own cookie-based session auth (client_session_token,
  // validated by requireClientAuth). The staff auth_token check below MUST NOT
  // run for these, or portal users (who never get an auth_token) get 401'd.
  // rbac.ts already exempts the same prefix for the read-only-role gate.
  '/api/portal/',
  // Client CRM has the same client-session boundary. Every route under this
  // prefix is additionally gated by 04-client-crm-access.ts.
  '/api/client-portal/crm/',
  '/api/office/_internal/',
  '/api/public/office-lobby',
  // Public email-marketing surfaces (Phase 4) — unsubscribe / subscribe /
  // double-opt-in confirm. Authorized by a signed link token (links.ts), not a
  // session; recipients have no cookies.
  '/api/public/email/',
  // Public first-party tracking beacon — cross-origin POSTs from external dealer
  // sites have no session cookie; tenancy is enforced by the embedded write key
  // (resolveSiteByWriteKey) + soft Origin allowlist inside the handler.
  '/api/public/track',
  '/api/public/lead-intent',
  '/api/xero/callback',
  '/api/_nuxt_icon',
  '/_nuxt',
  '/__nuxt_devtools__',
  // Internal crons — each enforces its own secret-header check inline
  '/api/internal/warmup',
  '/api/internal/attribution-cron',
  '/api/internal/ai-agent/',
  '/api/internal/ai-orchestrator/',
  '/api/internal/chat-archive',
  '/api/internal/email-to-board',
  '/api/internal/platform-agents/',
  '/api/internal/sync-spend',
  '/api/internal/workflows/',
  // agency-jobs queue bridge — workers/jobs-consumer POSTs each queue message
  // here; verifies x-cron-secret inline (no session cookie from the Worker).
  '/api/internal/process-job',
  '/api/leads/_internal/',
  '/api/cron/', // anomaly-detection cron + future cron handlers; each verifies x-cron-secret inline
  // MCP server Phase 1: the internal endpoints verify x-mcp-secret inline (called by the mcp-server
  // Worker, which has no session cookie); /api/mcp/authorize is browser-facing and does its OWN
  // requireAuth (redirecting to sign-in if needed), so the blanket session-401 must not pre-empt it.
  '/api/internal/mcp/',
  '/api/mcp/',
  // Public webhook endpoints — auth via per-endpoint secret in the request
  // body (Meta's verify_token, Google's google_key matched against
  // lead_webhook_endpoints.secret_key). Google + Meta servers don't have
  // session cookies, so these MUST be public.
  '/api/leads/webhook/',
  // Analytics export destination — authed by a hashed bearer token validated
  // inline against analytics_export_tokens (no session cookie).
  '/api/export/',
  // Public token-gated render redirect — for social platforms fetching media_urls
  // at publish time (incl. scheduled posts days later). Auth is the HMAC token itself.
  '/api/public/renders/',
  // Marketing contact form — anonymous visitors by definition. Gated inside the
  // handler by zod validation, a honeypot field and a per-IP throttle.
  '/api/public/contact'
]

// Paths that an authenticated cron can read with X-Internal-Cron-Secret.
// Narrow to read-only Xero + advisor surfaces — never include auth/
// admin/mutation endpoints, even with the secret.
const CRON_ALLOWED_PREFIXES = [
  '/api/xero/',
  '/api/advisor/',
  '/api/ai/financial-advisor'
]

type MiddlewareUser = User & { isCustomReadOnly?: boolean }

function getErrorStatusCode(error: unknown) {
  return error && typeof error === 'object' && 'statusCode' in error
    ? (error as { statusCode?: number }).statusCode
    : undefined
}

function getErrorName(error: unknown) {
  return error && typeof error === 'object' && 'name' in error
    ? (error as { name?: string }).name
    : undefined
}

function getErrorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? (error as { message?: string }).message
    : String(error)
}

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)

  // Skip auth for public API routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return
  }

  // Skip auth for non-API routes (pages handled by middleware in app)
  if (!pathname.startsWith('/api/')) {
    return
  }

  // Internal cron bypass: a process inside CF with the shared secret
  // can hit whitelisted read endpoints as a synthetic "cron" user.
  // Used by /api/internal/attribution-cron to re-measure metrics on
  // schedule. Silently falls through if the header is missing or the
  // path isn't whitelisted.
  const cronSecret = getHeader(event, 'x-internal-cron-secret')
  const expectedCronSecret = process.env.CRON_INTERNAL_SECRET
  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret
    && CRON_ALLOWED_PREFIXES.some(p => pathname.startsWith(p))) {
    event.context.user = {
      id: 'cron',
      email: 'cron@internal',
      name: 'Attribution Cron',
      role: 'owner',
      is_active: true
    }
    event.context.auth = { userId: 'cron', role: 'owner' }
    return
  }

  // Get token from cookie or Authorization header
  // Falls back to auth_token_client (non-httpOnly) for environments where
  // httpOnly cookies aren't reliably sent (e.g. after XHR-based login flows)
  const cookieToken = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
  const authHeader = getHeader(event, 'authorization')
  const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
      data: {
        redirect: '/login',
        message: 'Please sign in to continue'
      }
    })
  }

  // Check KV cache first (use first 16 chars of token as key — safe, not sensitive)
  const cacheKey = `auth-session:${token.slice(0, 16)}`
  const cachedUser = await kvGet<{ id: string, email: string, name: string, role: string, is_active: boolean, avatar_url?: string, custom_role_id?: string | null, permissionGroups?: string[], isCustomReadOnly?: boolean }>(event, cacheKey)

  if (cachedUser) {
    event.context.user = cachedUser
    event.context.auth = { userId: cachedUser.id, role: cachedUser.role }
    return
  }

  // Validate session via DB
  try {
    const user = await validateSession(token)

    if (!user) {
      // Token is genuinely invalid or user deactivated — clear cookies
      deleteCookie(event, 'auth_token')
      deleteCookie(event, 'auth_token_client')
      deleteCookie(event, 'auth_status')
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid or expired session',
        data: {
          redirect: '/login',
          message: 'Your session has expired. Please sign in again.'
        }
      })
    }

    // Resolve permission groups
    const resolved = await resolveUserPermissions(event, user.id, user.role, user.custom_role_id)
    user.permissionGroups = resolved.groups
    ;(user as MiddlewareUser).isCustomReadOnly = resolved.isReadOnly && !isReadOnlyRole(user.role)

    // Cache in KV for 5 minutes (includes permissionGroups + custom_role_id)
    kvPut(event, cacheKey, user, 300)

    event.context.user = user
    event.context.auth = { userId: user.id, role: user.role }
  } catch (error: unknown) {
    // Re-throw HTTP errors (our own 401 above)
    if (getErrorStatusCode(error)) throw error

    // Transient DB errors — return 503, do NOT delete cookies
    if (error instanceof TransientAuthError || getErrorName(error) === 'TransientAuthError') {
      console.error('[Auth Middleware] Transient DB error, returning 503:', getErrorMessage(error))
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable — please retry'
      })
    }

    // Unknown errors — also 503, don't nuke the session
    console.error('[Auth Middleware] Unexpected error during auth:', error)
    throw createError({
      statusCode: 503,
      statusMessage: 'Service temporarily unavailable'
    })
  }
})
