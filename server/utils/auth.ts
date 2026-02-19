import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { H3Event } from 'h3'
import { queryOne, queryRows } from './db'

const scryptAsync = promisify(scrypt)

// ============================================
// Password Hashing
// ============================================

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':')
  if (!salt || !key) return false
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
  const keyBuffer = Buffer.from(key, 'hex')
  return timingSafeEqual(derivedKey, keyBuffer)
}

// ============================================
// Token Generation
// ============================================

export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ============================================
// JWT-like Session Token (simplified)
// ============================================

interface SessionPayload {
  userId: string
  email: string
  role: string
  exp: number
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>, expiresInHours: number = 24 * 7): string {
  const exp = Date.now() + expiresInHours * 60 * 60 * 1000
  const data: SessionPayload = { ...payload, exp }
  const json = JSON.stringify(data)
  const base64 = Buffer.from(json).toString('base64url')
  const signature = createHash('sha256').update(`${base64}${JWT_SECRET}`).digest('hex')
  return `${base64}.${signature}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [base64, signature] = token.split('.')
    if (!base64 || !signature) return null
    const expectedSignature = createHash('sha256').update(`${base64}${JWT_SECRET}`).digest('hex')

    if (signature !== expectedSignature) {
      return null
    }

    const json = Buffer.from(base64, 'base64url').toString('utf-8')
    const payload: SessionPayload = JSON.parse(json)

    if (payload.exp < Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

// ============================================
// Session Management
// ============================================

export interface User {
  id: string
  email: string
  name: string
  role: string
  userRole?: string // Alias for role, used in some APIs
  user_role?: string // snake_case version used in DB results
  avatarUrl?: string
  departmentId?: string
  email_verified_at?: string | null
}

export async function createSession(
  userId: string,
  event?: H3Event
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  // Get device info from request if available
  let deviceInfo = null
  let ipAddress = null

  if (event) {
    const userAgent = getHeader(event, 'user-agent')
    ipAddress = getHeader(event, 'x-forwarded-for')?.split(',')[0] || getHeader(event, 'x-real-ip')

    if (userAgent) {
      deviceInfo = {
        browser: userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)/i)?.[0] || 'Unknown',
        os: userAgent.match(/(Windows|Mac|Linux|iOS|Android)/i)?.[0] || 'Unknown'
      }
    }
  }

  await queryOne(`
    INSERT INTO user_sessions (user_id, token_hash, device_info, ip_address, expires_at)
    VALUES ($1, $2, $3, $4::inet, $5)
    RETURNING id
  `, [userId, tokenHash, deviceInfo ? JSON.stringify(deviceInfo) : null, ipAddress, expiresAt])

  return { token, expiresAt }
}

export async function validateSession(token: string): Promise<User | null> {
  const tokenHash = hashToken(token)

  const session = await queryOne(`
    SELECT
      s.id as session_id,
      s.user_id,
      s.expires_at,
      u.email,
      u.name,
      u.user_role,
      u.avatar_url,
      u.department_id
    FROM user_sessions s
    JOIN team_members u ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > NOW()
  `, [tokenHash])

  if (!session) {
    return null
  }

  // Update last_used_at
  await queryOne('UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1', [session.session_id])

  // Update user's last_active_at
  await queryOne('UPDATE team_members SET last_active_at = NOW() WHERE id = $1', [session.user_id])

  return {
    id: session.user_id,
    email: session.email,
    name: session.name,
    role: session.user_role,
    avatarUrl: session.avatar_url,
    departmentId: session.department_id
  }
}

export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  await queryOne('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash])
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  await queryOne('DELETE FROM user_sessions WHERE user_id = $1', [userId])
}

// ============================================
// Request Authentication Helpers
// ============================================

export async function getAuthUser(event: H3Event): Promise<User | null> {
  // Check Authorization header first
  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return validateSession(token)
  }

  // Check cookie
  const token = getCookie(event, 'auth_token')
  if (token) {
    return validateSession(token)
  }

  return null
}

export async function requireAuth(event: H3Event): Promise<User> {
  const user = await getAuthUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }

  return user
}

export async function requireRole(event: H3Event, roles: string[]): Promise<User> {
  const user = await requireAuth(event)

  if (!roles.includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient permissions'
    })
  }

  return user
}

// ============================================
// Permission Checking
// ============================================

export async function checkPermission(
  userId: string,
  resourceType: string,
  resourceId: string | null,
  permission: string
): Promise<boolean> {
  const result = await queryOne(`
    SELECT has_permission($1, $2, $3, $4) as allowed
  `, [userId, resourceType, resourceId, permission])

  return result?.allowed === true
}

export async function requirePermission(
  event: H3Event,
  resourceType: string,
  resourceId: string | null,
  permission: string
): Promise<User> {
  const user = await requireAuth(event)

  const allowed = await checkPermission(user.id, resourceType, resourceId, permission)

  if (!allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: `Permission denied: ${permission} on ${resourceType}`
    })
  }

  return user
}

// ============================================
// Pricing Permission Helpers
// ============================================

export async function canAccessPricing(
  userId: string,
  resourceType: 'job_pricing' | 'quote',
  permission: 'view' | 'edit' | 'create' | 'delete'
): Promise<boolean> {
  // Get user role and department membership
  const user = await queryOne(`
    SELECT
      tm.user_role,
      EXISTS(
        SELECT 1 FROM department_members dm
        JOIN departments d ON dm.department_id = d.id
        WHERE dm.user_id = tm.id AND d.slug = 'sales'
      ) as is_sales_dept_member
    FROM team_members tm
    WHERE tm.id = $1
  `, [userId])

  if (!user) return false

  // Owners and admins have full access
  if (user.user_role === 'owner' || user.user_role === 'admin') {
    return true
  }

  // Sales role has full pricing access
  if (user.user_role === 'sales') {
    // Sales can do everything except delete job_pricing
    if (resourceType === 'job_pricing' && permission === 'delete') {
      return false
    }
    return true
  }

  // Sales department members have pricing access
  if (user.is_sales_dept_member) {
    // Same restrictions as sales role
    if (resourceType === 'job_pricing' && permission === 'delete') {
      return false
    }
    return true
  }

  // Members can only view quotes
  if (user.user_role === 'member' || user.user_role === 'viewer') {
    // Check if there's a specific permission rule
    const rule = await queryOne(`
      SELECT can_view, can_edit, can_create, can_delete
      FROM pricing_visibility_rules
      WHERE resource_type = $1
        AND role_required = $2
        AND (department_slug IS NULL OR department_slug = 'sales')
      ORDER BY department_slug NULLS LAST
      LIMIT 1
    `, [resourceType, user.user_role])

    if (rule) {
      switch (permission) {
        case 'view': return rule.can_view
        case 'edit': return rule.can_edit
        case 'create': return rule.can_create
        case 'delete': return rule.can_delete
      }
    }
  }

  return false
}

export async function requirePricingAccess(
  event: H3Event,
  resourceType: 'job_pricing' | 'quote',
  permission: 'view' | 'edit' | 'create' | 'delete'
): Promise<User> {
  const user = await requireAuth(event)

  const allowed = await canAccessPricing(user.id, resourceType, permission)

  if (!allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: `Access denied: Cannot ${permission} ${resourceType}`
    })
  }

  return user
}

// ============================================
// Activity Logging
// ============================================

export async function logActivity(params: {
  userId?: string
  action: string
  resourceType?: string
  resourceId?: string
  oldValues?: any
  newValues?: any
  event?: H3Event
  metadata?: any
}): Promise<void> {
  let ipAddress = null
  let userAgent = null

  if (params.event) {
    ipAddress = getHeader(params.event, 'x-forwarded-for')?.split(',')[0] ||
      getHeader(params.event, 'x-real-ip')
    userAgent = getHeader(params.event, 'user-agent')
  }

  await queryOne(`
    INSERT INTO activity_log (user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)
  `, [
    params.userId || null,
    params.action,
    params.resourceType || null,
    params.resourceId || null,
    params.oldValues ? JSON.stringify(params.oldValues) : null,
    params.newValues ? JSON.stringify(params.newValues) : null,
    ipAddress,
    userAgent
  ])
}
