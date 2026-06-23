import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { queryOne, queryRows, execute } from './db'
import { isReadOnlyRole, PERMISSIONS, permissionGroupsForRoles, roleHasPermission, type PermissionGroup } from './permissions'
import { resolveUserPermissions } from './roleResolver'

export interface User {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  avatar_url?: string
  custom_role_id?: string | null
  permissionGroups?: string[]
}

export interface ClientUser {
  id: string
  email: string
  name: string
  client_id: string
  implementation_id: string
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Generate secure token
export function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Get user by email (team member)
export async function getUserByEmail(email: string): Promise<User | null> {
  const user = await queryOne<User>(
    `SELECT id, email, name, user_role as role, is_active, custom_role_id
     FROM team_members
     WHERE email = $1`,
    [email.toLowerCase()]
  )
  return user
}

// Get client user by email
export async function getClientUserByEmail(email: string): Promise<ClientUser | null> {
  const user = await queryOne<ClientUser>(
    `SELECT i.id, i.client_portal_access_token as email, c.name, i.client_id, i.id as implementation_id
     FROM xero_implementations i
     JOIN agency_clients c ON i.client_id = c.id
     WHERE i.client_portal_enabled = true 
     AND i.client_portal_access_token = $1`,
    [email.toLowerCase()]
  )
  return user
}

// Custom error class for transient failures (DB down, network issues)
export class TransientAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'TransientAuthError'
  }
}

// Validate session token
// Returns User if valid, null if token is invalid/expired.
// Throws TransientAuthError if DB is unreachable (caller should NOT treat as logout).
export async function validateSession(token: string): Promise<User | null> {
  const payload = await verifyJwt(token)
  if (!payload || !payload.userId) return null

  // DB lookup — let connection errors propagate as TransientAuthError
  try {
    const row = await queryOne<User & { sessions_invalidated_at?: string | null }>(
      `SELECT id, email, name, user_role as role, is_active, avatar_url, custom_role_id, sessions_invalidated_at
       FROM team_members
       WHERE id = $1 AND is_active = true`,
      [payload.userId]
    )
    if (!row) return null

    // Stateless-JWT session revocation: invalidateAllSessions() stamps
    // team_members.sessions_invalidated_at. Reject any token minted before that
    // instant (e.g. issued under a since-changed password). A token without `iat`
    // can't be proven newer, so it's rejected once a marker exists.
    if (row.sessions_invalidated_at) {
      const invalidatedAt = new Date(row.sessions_invalidated_at).getTime()
      if (!payload.iat || payload.iat < invalidatedAt) return null
    }

    // Strip the internal marker — it's not part of the public User shape.
    const { sessions_invalidated_at: _ignored, ...user } = row
    return user as User
  } catch (dbError) {
    throw new TransientAuthError('Database unreachable during session validation', dbError)
  }
}

// JWT helpers (simplified - consider using a proper JWT library)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function createJwt(payload: object): Promise<string> {
  const fullPayload = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + JWT_EXPIRY_MS,
  }
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(fullPayload))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, data)
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(data)))
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `${base64Data}.${base64Sig}`
}

export async function verifyJwt(token: string): Promise<any | null> {
  try {
    const [dataB64, sigB64] = token.split('.')
    if (!dataB64 || !sigB64) return null

    const encoder = new TextEncoder()
    const data = new Uint8Array([...atob(dataB64)].map(c => c.charCodeAt(0)))
    const sigBytes = new Uint8Array([...atob(sigB64)].map(c => c.charCodeAt(0)))

    // Verify HMAC signature
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data)
    if (!isValid) return null

    const payload = JSON.parse(new TextDecoder().decode(data))

    // Check expiry (old tokens without exp are allowed for backward compat)
    if (payload.exp && Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}

// Role-based access control — checks legacy role name + dynamic permission groups
export function hasRole(user: User, allowedRoles: string[]): boolean {
  // Legacy: direct role name match
  if (allowedRoles.includes(user.role)) return true
  // Dynamic: check if allowedRoles correspond to any permission group the user has.
  // Multiple groups can share the same role array (e.g. MANAGEMENT, TIME_APPROVALS, AUTOMATION
  // all have ['owner','admin','lead','project_manager']), so we must check ALL matches.
  if (user.permissionGroups?.length) {
    const groups = permissionGroupsForRoles(allowedRoles)
    if (groups.some(g => user.permissionGroups!.includes(g))) return true
  }
  return false
}

// Check if user can access implementation
export async function canAccessImplementation(userId: string, implementationId: string): Promise<boolean> {
  const result = await queryOne(
    `SELECT 1 FROM xero_implementations 
     WHERE id = $1 
     AND (project_manager_id = $2 OR assigned_consultant_id = $2)`,
    [implementationId, userId]
  )
  return !!result
}

// Require authentication helper for API routes
// Note: Most API routes already pass through server/middleware/auth.ts which
// validates the token and sets event.context.user. This function is a fallback
// for routes that bypass the middleware or need re-validation.
export async function requireAuth(event: any): Promise<User> {
  // Fast path: middleware already validated
  if (event.context.user) {
    return event.context.user as User
  }

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - No token' })
  }

  try {
    const user = await validateSession(token)
    if (!user) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Invalid session' })
    }
    // Resolve permission groups for the slow path (middleware normally does this)
    if (!user.permissionGroups) {
      const resolved = await resolveUserPermissions(event, user.id, user.role, user.custom_role_id)
      user.permissionGroups = resolved.groups
      ;(user as any).isCustomReadOnly = resolved.isReadOnly && !isReadOnlyRole(user.role)
    }
    return user
  } catch (error: any) {
    if (error.statusCode) throw error
    // TransientAuthError from validateSession — return 503, not 401
    if (error instanceof TransientAuthError || error.name === 'TransientAuthError') {
      throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
    }
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }
}

// Require role helper for API routes
export async function requireRole(event: any, roles: readonly string[]): Promise<User> {
  const user = await requireAuth(event)

  // Skip role check in local development
  if (import.meta.dev) {
    return user
  }

  if (!hasRole(user, roles as string[])) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient permissions' })
  }

  return user
}

/**
 * Require a permission GROUP (e.g. 'MANAGEMENT', 'FINANCE'). Honors both the legacy role→group map
 * AND a user's dynamic `permissionGroups` (custom roles) — unlike a bare `roleHasPermission(user.role)`
 * check, which misses custom roles granted the group. Mirrors requireRole's dev-skip.
 */
export async function requirePermission(event: any, group: PermissionGroup): Promise<User> {
  const user = await requireAuth(event)
  if (import.meta.dev) return user
  if (roleHasPermission(user.role, group)) return user
  if (user.permissionGroups?.includes(group)) return user
  throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient permissions' })
}

// Require write access - blocks viewer/guest roles and custom read-only roles from mutations
export async function requireWriteAccess(event: any): Promise<User> {
  const user = await requireAuth(event)
  if (isReadOnlyRole(user.role) || (user as any).isCustomReadOnly) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Read-only access' })
  }
  return user
}

// Require board access - checks user is a member/manager of the department (board) or an admin
// Accepts both UUID and slug for boardId
export async function requireBoardAccess(event: any, boardId: string): Promise<User> {
  const user = await requireAuth(event)

  // Resolve slug to UUID if needed
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardId)
  let resolvedId = boardId
  if (!isUUID) {
    const dept = await queryOne<{ id: string }>('SELECT id FROM departments WHERE slug = $1', [boardId])
    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }
    resolvedId = dept.id
  }

  // Admins and owners bypass board membership checks
  if (user.role === 'admin' || user.role === 'owner') {
    return user
  }

  try {
    const rows = await queryRows(
      `SELECT 1 FROM department_members WHERE department_id = $1 AND team_member_id = $2
       UNION
       SELECT 1 FROM departments WHERE id = $1 AND manager_id = $2`,
      [resolvedId, user.id]
    )

    if (rows.length === 0) {
      throw createError({ statusCode: 403, statusMessage: 'Access denied to this board' })
    }
  } catch (error: any) {
    // If error is already a 403 we threw, re-throw it
    if (error.statusCode === 403) throw error

    // Graceful degradation: if department_members table doesn't exist,
    // fall back to checking if the department exists at all
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      const dept = await queryOne('SELECT id FROM departments WHERE id = $1', [resolvedId])
      if (!dept) {
        throw createError({ statusCode: 404, statusMessage: 'Board not found' })
      }
    } else {
      throw error
    }
  }

  return user
}

// Get authenticated user (alias for requireAuth for compatibility)
export async function getAuthUser(event: any): Promise<User> {
  return requireAuth(event)
}

// Log activity (stub for compatibility)
export async function logActivity(event: any, action: string, entityType?: string, entityId?: string, details?: any): Promise<void> {
  const user = await requireAuth(event).catch(() => null)
  console.log('[Activity Log]', {
    userId: user?.id,
    action,
    entityType,
    entityId,
    details,
    timestamp: new Date().toISOString()
  })
}

// Hash a bearer/verification token for at-rest storage. Used for the magic-link,
// password-reset, and email-verification `token_hash` columns — callers store and
// look up by this digest, never the raw token, so a DB read cannot recover a usable
// token. SHA-256 (not bcrypt) is correct here: these are high-entropy random tokens
// (generateToken = 32 random bytes), not low-entropy user passwords, so a fast digest
// is fine and lets lookups stay deterministic. createHash(node:crypto) runs on the
// Cloudflare edge (nodejs_compat) — see server/utils/leads/idempotency.ts.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Create session (stub for compatibility)
export async function createSession(userId: string, event?: any): Promise<string> {
  return createJwt({ userId })
}

// Invalidate all of a user's sessions by stamping a revocation cutoff. validateSession
// rejects any JWT minted before this instant, so issued-but-stolen tokens (and tokens
// from before a password reset) stop working immediately — the stateless-JWT equivalent
// of clearing a server-side session store. Called from password reset + user deactivation.
export async function invalidateAllSessions(userId: string): Promise<void> {
  await execute(
    `UPDATE team_members SET sessions_invalidated_at = NOW() WHERE id = $1`,
    [userId]
  )
}

// Require pricing access (stub for compatibility)
// `owner` is the top-level superuser (treated as such everywhere else in auth,
// e.g. board access) — without it the agency owner is locked out of creating /
// editing quotes in the Pricing module and CRM quote generation. Grant-only.
export async function requirePricingAccess(event: any): Promise<User> {
  return requireRole(event, ['owner', 'admin', 'project_manager'])
}

// ============================================
// Magic Link Authentication
// ============================================

export interface MagicLinkToken {
  id: string
  userId: string
  email: string
  token: string
  expiresAt: Date
}

/**
 * Generate a magic link token for a user
 */
export async function generateMagicLink(userId: string, email: string): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)

  // Token expires in 1 hour
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1)

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO magic_link_tokens (user_id, token_hash, email, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, tokenHash, email.toLowerCase(), expiresAt]
  )

  console.log(`[Magic Link Generate] Stored token=${tokenHash.substring(0, 10)}... id=${inserted?.id} user=${userId} expires=${expiresAt.toISOString()}`)

  return token
}

/**
 * Verify a magic link token and return the associated user.
 * Uses atomic UPDATE...RETURNING to prevent race conditions.
 */
export async function verifyMagicLink(token: string): Promise<User | null> {
  const tokenHash = hashToken(token)
  const prefix = `[Magic Link Verify] token=${tokenHash.substring(0, 10)}...`

  // Atomic: claim the token in a single statement (prevents double-use race)
  const claimed = await queryOne<{ user_id: string; email: string }>(
    `UPDATE magic_link_tokens
     SET used = true, used_at = NOW()
     WHERE token_hash = $1 AND used = false AND expires_at > NOW()
     RETURNING user_id, email`,
    [tokenHash]
  )

  if (!claimed) {
    // Token wasn't claimed — diagnose why for logging
    const existing = await queryOne<{ used: boolean; expires_at: string; created_at: string }>(
      `SELECT used, expires_at, created_at FROM magic_link_tokens WHERE token_hash = $1`,
      [tokenHash]
    )
    if (!existing) {
      console.error(`${prefix} FAIL: token not found in DB`)
    } else if (existing.used) {
      console.error(`${prefix} FAIL: token already used`)
    } else {
      console.error(`${prefix} FAIL: token expired (expires_at=${existing.expires_at}, now=${new Date().toISOString()}, created=${existing.created_at})`)
    }
    return null
  }

  console.log(`${prefix} OK — claimed for user_id=${claimed.user_id}`)

  // Get the user
  const user = await queryOne<User>(
    `SELECT id, email, name, user_role as role, is_active, custom_role_id
     FROM team_members
     WHERE id = $1 AND is_active = true`,
    [claimed.user_id]
  )

  if (!user) {
    console.error(`${prefix} FAIL: user ${claimed.user_id} not found or inactive`)
    return null
  }

  // Update last login
  await queryOne(
    `UPDATE team_members SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  )

  return user
}

/**
 * Invalidate all magic links for a user
 */
export async function invalidateUserMagicLinks(userId: string): Promise<void> {
  await queryOne(
    `DELETE FROM magic_link_tokens WHERE user_id = $1`,
    [userId]
  )
}

/**
 * Get user roles for authorization
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  const user = await queryOne<{ role: string }>(
    `SELECT user_role as role FROM team_members WHERE id = $1`,
    [userId]
  )
  return user ? [user.role] : []
}
