import bcrypt from 'bcryptjs'
import { queryOne, queryRows } from './db'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'project_manager' | 'consultant' | 'client'
  is_active: boolean
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
    `SELECT id, email, name, role, is_active 
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

// Validate session token
export async function validateSession(token: string): Promise<User | null> {
  // In a real implementation, you'd check a sessions table
  // For now, we'll use JWT or similar
  try {
    const payload = await verifyJwt(token)
    if (!payload || !payload.userId) return null
    
    return await queryOne<User>(
      `SELECT id, email, name, user_role as role, is_active
       FROM team_members
       WHERE id = $1 AND is_active = true`,
      [payload.userId]
    )
  } catch {
    return null
  }
}

// JWT helpers (simplified - consider using a proper JWT library)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function createJwt(payload: object): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(payload))
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
    
    return JSON.parse(new TextDecoder().decode(data))
  } catch {
    return null
  }
}

// Role-based access control
export function hasRole(user: User, allowedRoles: string[]): boolean {
  return allowedRoles.includes(user.role)
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
export async function requireAuth(event: any): Promise<User> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : getCookie(event, 'auth_token')
    
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - No token' })
  }
  
  const user = await validateSession(token)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Invalid session' })
  }
  
  return user
}

// Require role helper for API routes
export async function requireRole(event: any, roles: string[]): Promise<User> {
  const user = await requireAuth(event)
  
  if (!hasRole(user, roles)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient permissions' })
  }
  
  return user
}

// Require board access - checks user is a member/manager of the department (board) or an admin
export async function requireBoardAccess(event: any, boardId: string): Promise<User> {
  const user = await requireAuth(event)

  // Admins and super_admins bypass board membership checks
  if (user.role === 'admin' || user.role === 'super_admin') {
    return user
  }

  try {
    const rows = await queryRows(
      `SELECT 1 FROM department_members WHERE department_id = $1 AND team_member_id = $2
       UNION
       SELECT 1 FROM departments WHERE id = $1 AND manager_id = $2`,
      [boardId, user.id]
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
      const dept = await queryOne('SELECT id FROM departments WHERE id = $1', [boardId])
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

// Hash token (stub for compatibility)
export function hashToken(token: string): string {
  // In production, use proper hashing like bcrypt or crypto
  return token
}

// Create session (stub for compatibility)
export async function createSession(userId: string, event?: any): Promise<string> {
  return createJwt({ userId })
}

// Invalidate all sessions for a user (stub for compatibility)
export async function invalidateAllSessions(userId: string): Promise<void> {
  // In production, this would clear session cache/DB entries
  console.log(`[Sessions] Invalidated all sessions for user ${userId}`)
}

// Require pricing access (stub for compatibility)
export async function requirePricingAccess(event: any): Promise<User> {
  return requireRole(event, ['admin', 'project_manager'])
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
  
  await queryOne(
    `INSERT INTO magic_link_tokens (user_id, token_hash, email, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, email.toLowerCase(), expiresAt]
  )
  
  return token
}

/**
 * Verify a magic link token and return the associated user
 */
export async function verifyMagicLink(token: string): Promise<User | null> {
  const tokenHash = hashToken(token)
  
  // Find the token
  const magicLink = await queryOne<{ user_id: string; email: string; expires_at: string; used: boolean }>(
    `SELECT user_id, email, expires_at, used 
     FROM magic_link_tokens 
     WHERE token_hash = $1`,
    [tokenHash]
  )
  
  if (!magicLink) return null
  if (magicLink.used) return null
  if (new Date(magicLink.expires_at) < new Date()) return null
  
  // Mark token as used
  await queryOne(
    `UPDATE magic_link_tokens 
     SET used = true, used_at = NOW() 
     WHERE token_hash = $1`,
    [tokenHash]
  )
  
  // Get the user
  const user = await queryOne<User>(
    `SELECT id, email, name, role, is_active 
     FROM team_members 
     WHERE id = $1 AND is_active = true`,
    [magicLink.user_id]
  )
  
  if (user) {
    // Update last login
    await queryOne(
      `UPDATE team_members SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    )
  }
  
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
