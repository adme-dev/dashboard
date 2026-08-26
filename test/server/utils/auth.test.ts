/**
 * Auth Utility Tests
 *
 * Rewritten against the CURRENT auth model (server/utils/auth.ts). The previous
 * suite tested a since-removed implementation wholesale, so it could not be
 * ported line-by-line. The auth layer was rewritten:
 *
 *   - Password hashing: scrypt(`salt:key`) -> bcrypt (bcrypt.hash(pwd, 10))
 *   - hashToken: SHA-256 -> passthrough stub (returns the token unchanged)
 *   - Sessions: DB-backed `user_sessions` table -> STATELESS HMAC JWT
 *       createSessionToken/verifySessionToken (sync) -> createJwt/verifyJwt (async)
 *   - Permissions: per-entity `checkPermission(user,entity,id,action)` ->
 *       group-based RBAC (requirePermission(event, GROUP)) + dedicated entity
 *       checks (canAccessImplementation, requireBoardAccess)
 *   - Pricing: canAccessPricing(userId,res,action) -> requirePricingAccess(event)
 *       (role gate: owner/admin/project_manager)
 *
 * SECURITY HARDENING (both gaps found during this rewrite are now FIXED in
 * server/utils/auth.ts + migration 191 — tests below assert the fixed behaviour):
 *   1. Session revocation. `invalidateAllSessions` was a no-op stub. It now stamps
 *      team_members.sessions_invalidated_at, and validateSession rejects any JWT
 *      whose `iat` predates that instant — giving the stateless-JWT model genuine
 *      "log out everywhere" (used by password reset + user deactivation).
 *   2. Token-at-rest. `hashToken` was a passthrough, so magic-link / password-reset
 *      / email-verification tokens were stored UNHASHED. It now SHA-256-digests the
 *      token, so a DB read can't recover a usable token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERMISSIONS } from '../../../server/utils/permissions'

// Mock the DB layer auth.ts depends on (`./db`).
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
vi.mock('../../../server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args),
  execute: (...args: any[]) => mockExecute(...args)
}))

// Mock the custom-role permission resolver (requireAuth's slow path calls it).
const mockResolveUserPermissions = vi.fn()
vi.mock('../../../server/utils/roleResolver', () => ({
  resolveUserPermissions: (...args: any[]) => mockResolveUserPermissions(...args)
}))

const mockResolveGodModeAuthority = vi.fn()
vi.mock('../../../server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: (...args: any[]) => mockResolveGodModeAuthority(...args),
  isActiveGodModeAuthority: (authority: unknown, actorUserId: string) => {
    const candidate = authority as Record<string, unknown> | null
    return candidate?.active === true
      && candidate.actorUserId === actorUserId
      && candidate.reason === 'active_owner'
      && candidate.emergencyDisabled === false
  }
}))

// auth.ts uses Nuxt auto-imports (bare getHeader/getCookie/createError) — provide
// them as globals. createError is already supplied by test/setup.ts.
const mockGetHeader = vi.fn()
const mockGetCookie = vi.fn()
;(globalThis as any).getHeader = mockGetHeader
;(globalThis as any).getCookie = mockGetCookie

import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  createJwt,
  verifyJwt,
  createSession,
  validateSession,
  invalidateAllSessions,
  TransientAuthError,
  hasRole,
  canAccessImplementation,
  getUserByEmail,
  getUserRoles,
  requireAuth,
  requireRole,
  requirePermission,
  requireWriteAccess,
  requirePricingAccess,
  getAuthUser,
  generateMagicLink,
  verifyMagicLink,
  invalidateUserMagicLinks
} from '../../../server/utils/auth'
import { seedGodModeRouteAuditState } from '../../../server/utils/godMode/featureGate'

function auditedGodModeReadEvent(user: any) {
  const event = {
    method: 'GET',
    path: '/api/agency/operations/queue-health',
    context: { user },
    node: {
      req: {
        originalUrl: '/api/agency/operations/queue-health',
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
  seedGodModeRouteAuditState(event, {
    actorUserId: user.id,
    correlationId: '33333333-3333-4333-8333-333333333333',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: 'GET /api/agency/operations/queue-health',
    emergencyDisabled: false
  })
  return event
}

function ordinaryMutationEvent(user: any, path = '/api/agency/example') {
  return {
    method: 'POST',
    path,
    context: { user },
    node: {
      req: {
        originalUrl: path,
        headers: {
          host: 'app.xeroflow.test',
          authorization: 'Bearer owner-session-secret'
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveUserPermissions.mockResolvedValue({ groups: ['MANAGEMENT'], isReadOnly: false })
  mockResolveGodModeAuthority.mockResolvedValue({
    active: false,
    actorUserId: '00000000-0000-4000-8000-000000000000',
    reason: 'not_owner',
    emergencyDisabled: false
  })
})

describe('auth utility', () => {
  // ── Password hashing (bcrypt) ───────────────────────────────────────────
  describe('hashPassword / verifyPassword', () => {
    it('produces a bcrypt hash that verifies against the original password', async () => {
      const hash = await hashPassword('securePassword123')
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/) // bcrypt prefix, e.g. $2a$10$
      await expect(verifyPassword('securePassword123', hash)).resolves.toBe(true)
    })

    it('produces different hashes for the same password (per-hash salt)', async () => {
      const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')])
      expect(a).not.toBe(b)
    })

    it('rejects an incorrect password', async () => {
      const hash = await hashPassword('correct')
      await expect(verifyPassword('wrong', hash)).resolves.toBe(false)
    })

    it('verifies unicode passwords', async () => {
      const hash = await hashPassword('密码🔐passw0rd')
      await expect(verifyPassword('密码🔐passw0rd', hash)).resolves.toBe(true)
    })
  })

  // ── Token generation ────────────────────────────────────────────────────
  describe('generateToken', () => {
    it('returns a 64-char hex string (32 random bytes)', () => {
      const token = generateToken()
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[0-9a-f]+$/i)
    })

    it('returns unique values across calls', () => {
      const set = new Set(Array.from({ length: 100 }, () => generateToken()))
      expect(set.size).toBe(100)
    })
  })

  describe('hashToken', () => {
    it('SHA-256-digests the token (64-char hex, deterministic, not the raw token)', () => {
      const hash = hashToken('test-token')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(hash).not.toBe('test-token')
      expect(hashToken('test-token')).toBe(hash) // deterministic — lookups work
      expect(hashToken('other-token')).not.toBe(hash)
    })
  })

  // ── Stateless JWT session tokens ────────────────────────────────────────
  describe('createJwt / verifyJwt', () => {
    it('round-trips a payload through sign + verify', async () => {
      const token = await createJwt({ userId: 'user-456', role: 'admin' })
      expect(token).toContain('.')

      const verified = await verifyJwt(token)
      expect(verified).not.toBeNull()
      expect(verified.userId).toBe('user-456')
      expect(verified.role).toBe('admin')
      expect(verified.exp).toBeGreaterThan(Date.now())
    })

    it('rejects a token with a tampered signature', async () => {
      const token = await createJwt({ userId: 'u1', role: 'member' })
      const [data] = token.split('.')
      await expect(verifyJwt(`${data}.invalidSignature`)).resolves.toBeNull()
    })

    it('rejects a token with a tampered payload (privilege escalation attempt)', async () => {
      const token = await createJwt({ userId: 'u1', role: 'member' })
      const [, sig] = token.split('.')
      const forged = JSON.stringify({ userId: 'u1', role: 'admin', exp: Date.now() + 1e9 })
      const forgedData = btoa(String.fromCharCode(...new TextEncoder().encode(forged)))
      await expect(verifyJwt(`${forgedData}.${sig}`)).resolves.toBeNull()
    })

    it('rejects an expired token', async () => {
      vi.useFakeTimers()
      try {
        const token = await createJwt({ userId: 'u1' }) // 7-day fixed expiry
        vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000) // +8 days
        await expect(verifyJwt(token)).resolves.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects malformed tokens', async () => {
      await expect(verifyJwt('')).resolves.toBeNull()
      await expect(verifyJwt('no-dot')).resolves.toBeNull()
      await expect(verifyJwt('invalid.base64!')).resolves.toBeNull()
    })
  })

  describe('createSession', () => {
    it('mints a verifiable JWT for the user (stateless — no DB write)', async () => {
      const token = await createSession('user-123')
      const verified = await verifyJwt(token)
      expect(verified?.userId).toBe('user-123')
      // No user_sessions INSERT in the stateless model.
      expect(mockQueryOne).not.toHaveBeenCalled()
    })
  })

  describe('validateSession', () => {
    it('returns the active user for a valid token', async () => {
      const token = await createJwt({ userId: 'user-456' })
      mockQueryOne.mockResolvedValueOnce({
        id: 'user-456',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        is_active: true
      })

      const user = await validateSession(token)
      expect(user?.id).toBe('user-456')
      expect(user?.role).toBe('admin')
    })

    it('returns null for an invalid/garbage token without hitting the DB', async () => {
      const user = await validateSession('not-a-jwt')
      expect(user).toBeNull()
      expect(mockQueryOne).not.toHaveBeenCalled()
    })

    it('throws TransientAuthError when the DB is unreachable (not a logout)', async () => {
      const token = await createJwt({ userId: 'user-456' })
      mockQueryOne.mockRejectedValueOnce(new Error('fetch failed'))
      await expect(validateSession(token)).rejects.toBeInstanceOf(TransientAuthError)
    })

    it('rejects a token minted before the user revocation cutoff', async () => {
      const token = await createJwt({ userId: 'user-456' }) // iat = now
      // Cutoff is 1 minute in the FUTURE relative to the token's iat → revoked.
      mockQueryOne.mockResolvedValueOnce({
        id: 'user-456', email: 'e', name: 'n', role: 'admin', is_active: true,
        sessions_invalidated_at: new Date(Date.now() + 60_000).toISOString()
      })
      await expect(validateSession(token)).resolves.toBeNull()
    })

    it('accepts a token minted after the revocation cutoff', async () => {
      const token = await createJwt({ userId: 'user-456' }) // iat = now
      mockQueryOne.mockResolvedValueOnce({
        id: 'user-456', email: 'e', name: 'n', role: 'admin', is_active: true,
        sessions_invalidated_at: new Date(Date.now() - 60_000).toISOString() // cutoff in the past
      })
      const user = await validateSession(token)
      expect(user?.id).toBe('user-456')
      // the internal marker must not leak into the returned User
      expect(user as any).not.toHaveProperty('sessions_invalidated_at')
    })
  })

  describe('invalidateAllSessions', () => {
    it('stamps the user revocation cutoff (real UPDATE, not a no-op)', async () => {
      mockExecute.mockResolvedValueOnce(1)
      await invalidateAllSessions('user-123')
      const [sql, params] = mockExecute.mock.calls[0]
      expect(String(sql)).toMatch(/UPDATE team_members SET sessions_invalidated_at = NOW\(\)/)
      expect(params).toEqual(['user-123'])
    })
  })

  // ── Role / permission model ─────────────────────────────────────────────
  describe('hasRole', () => {
    const baseUser = { id: 'u1', email: 'e', name: 'n', role: 'admin', is_active: true }

    it('matches on the legacy role name', () => {
      expect(hasRole({ ...baseUser, role: 'admin' } as any, ['admin', 'owner'])).toBe(true)
    })

    it('matches via dynamic permission groups when allowedRoles equals a group role set', () => {
      // hasRole's dynamic path is an EXACT reverse-lookup: allowedRoles must equal
      // a PERMISSIONS group's full role array (permissionGroupsForRoles joins+compares).
      // A custom role carrying the resolved group then satisfies the check.
      const customUser = { ...baseUser, role: 'custom_x', permissionGroups: ['MEDIA_BUYING'] }
      expect(hasRole(customUser as any, PERMISSIONS.MEDIA_BUYING as any)).toBe(true)
    })

    it('denies when neither the role nor any group matches', () => {
      const viewer = { ...baseUser, role: 'viewer', permissionGroups: [] }
      expect(hasRole(viewer as any, ['admin', 'owner'])).toBe(false)
    })
  })

  describe('requireAuth', () => {
    it('fast-path: returns the user already on event.context', async () => {
      const user = { id: 'ctx', role: 'admin', permissionGroups: ['MANAGEMENT'] }
      const result = await requireAuth({ context: { user } } as any)
      expect(result).toBe(user)
      expect(mockGetHeader).not.toHaveBeenCalled()
    })

    it('extracts a Bearer token, validates it, and resolves permission groups', async () => {
      const token = await createJwt({ userId: 'u1' })
      mockGetHeader.mockImplementation((_e: any, h: string) => (h === 'authorization' ? `Bearer ${token}` : null))
      mockQueryOne.mockResolvedValueOnce({ id: 'u1', email: 'a@b.c', name: 'A', role: 'admin', is_active: true })

      const result = await requireAuth({ context: {} } as any)
      expect(result.id).toBe('u1')
      expect(result.permissionGroups).toEqual(['MANAGEMENT'])
      expect(mockResolveUserPermissions).toHaveBeenCalled()
    })

    it('falls back to the auth cookie when no Authorization header is present', async () => {
      const token = await createJwt({ userId: 'u2' })
      mockGetHeader.mockReturnValue(null)
      mockGetCookie.mockImplementation((_e: any, name: string) => (name === 'auth_token' ? token : null))
      mockQueryOne.mockResolvedValueOnce({ id: 'u2', email: 'c@d.e', name: 'C', role: 'member', is_active: true })

      const result = await requireAuth({ context: {} } as any)
      expect(result.id).toBe('u2')
    })

    it('throws 401 when no token is provided', async () => {
      mockGetHeader.mockReturnValue(null)
      mockGetCookie.mockReturnValue(null)
      await expect(requireAuth({ context: {} } as any)).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized - No token'
      })
    })

    it('does not bypass authentication even when an unrelated authority lookup would be active', async () => {
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: '11111111-1111-4111-8111-111111111111',
        reason: 'active_owner',
        emergencyDisabled: false
      })
      mockGetHeader.mockReturnValue(null)
      mockGetCookie.mockReturnValue(null)

      await expect(requireAuth({ method: 'GET', context: {} } as any)).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized - No token'
      })
      expect(mockResolveGodModeAuthority).not.toHaveBeenCalled()
    })

    it('throws 401 when the session is invalid', async () => {
      mockGetHeader.mockImplementation((_e: any, h: string) => (h === 'authorization' ? 'Bearer not-a-jwt' : null))
      await expect(requireAuth({ context: {} } as any)).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized - Invalid session'
      })
    })

    it('throws 503 (not 401) when validation fails transiently', async () => {
      const token = await createJwt({ userId: 'u1' })
      mockGetHeader.mockImplementation((_e: any, h: string) => (h === 'authorization' ? `Bearer ${token}` : null))
      mockQueryOne.mockRejectedValueOnce(new Error('fetch failed'))
      await expect(requireAuth({ context: {} } as any)).rejects.toMatchObject({ statusCode: 503 })
    })
  })

  describe('requireRole', () => {
    it('returns the user when the role is allowed', async () => {
      const user = { id: 'u1', role: 'admin', permissionGroups: [] }
      const result = await requireRole({ context: { user } } as any, ['admin', 'owner'])
      expect(result.role).toBe('admin')
    })

    it('throws 403 when the role is not allowed', async () => {
      const user = { id: 'u1', role: 'viewer', permissionGroups: [] }
      await expect(requireRole({ context: { user } } as any, ['admin', 'owner'])).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Forbidden - Insufficient permissions'
      })
    })

    it('allows a freshly verified active owner when the normal role decision denies', async () => {
      const user = { id: '11111111-1111-4111-8111-111111111111', role: 'viewer', permissionGroups: [] }
      const event = auditedGodModeReadEvent(user)
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: user.id,
        reason: 'active_owner',
        emergencyDisabled: false
      })

      await expect(requireRole(event, ['admin'])).resolves.toBe(user)
    })

    it.each([
      ['inactive_or_missing', false],
      ['not_owner', false],
      ['emergency_disabled', true]
    ])('preserves the original denial for %s authority', async (reason, emergencyDisabled) => {
      const user = { id: '22222222-2222-4222-8222-222222222222', role: 'viewer', permissionGroups: [] }
      mockResolveGodModeAuthority.mockResolvedValue({ active: false, actorUserId: user.id, reason, emergencyDisabled })

      await expect(requireRole({ method: 'GET', context: { user } } as any, ['admin'])).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Forbidden - Insufficient permissions'
      })
    })
  })

  describe('requirePermission (group-based RBAC)', () => {
    it('allows a role whose legacy map grants the group', async () => {
      const user = { id: 'u1', role: 'owner', permissionGroups: [] }
      const result = await requirePermission({ context: { user } } as any, 'FINANCE' as any)
      expect(result.role).toBe('owner')
    })

    it('allows a custom role carrying the group via permissionGroups', async () => {
      const user = { id: 'u1', role: 'custom_x', permissionGroups: ['FINANCE'] }
      const result = await requirePermission({ context: { user } } as any, 'FINANCE' as any)
      expect(result.id).toBe('u1')
    })

    it('throws 403 when neither the role nor groups grant the permission', async () => {
      const user = { id: 'u1', role: 'media_buyer', permissionGroups: [] }
      await expect(requirePermission({ context: { user } } as any, 'FINANCE' as any)).rejects.toMatchObject({
        statusCode: 403
      })
    })

    it('allows a freshly verified active owner when normal group RBAC denies', async () => {
      const user = { id: '11111111-1111-4111-8111-111111111111', role: 'media_buyer', permissionGroups: [] }
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: user.id,
        reason: 'active_owner',
        emergencyDisabled: false
      })

      await expect(requirePermission(auditedGodModeReadEvent(user), 'FINANCE' as any)).resolves.toBe(user)
    })
  })

  describe('requireWriteAccess', () => {
    it('allows a writer role', async () => {
      const user = { id: 'u1', role: 'admin', permissionGroups: [] }
      await expect(requireWriteAccess({ context: { user } } as any)).resolves.toBe(user)
    })

    it('throws 403 for a read-only role', async () => {
      const user = { id: 'u1', role: 'viewer', permissionGroups: [] }
      await expect(requireWriteAccess({ context: { user } } as any)).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Forbidden - Read-only access'
      })
    })

    it('throws 403 for a custom read-only role', async () => {
      const user = { id: 'u1', role: 'custom_x', permissionGroups: [], isCustomReadOnly: true }
      await expect(requireWriteAccess({ context: { user } } as any)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('allows a freshly verified active owner through a read-only application check', async () => {
      const user = {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'viewer',
        permissionGroups: []
      }
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: user.id,
        reason: 'active_owner',
        emergencyDisabled: false
      })

      await expect(requireWriteAccess(auditedGodModeReadEvent(user))).resolves.toBe(user)
    })

    it('fails closed when code requests an uncoordinated mutation bypass', async () => {
      const user = {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'viewer',
        permissionGroups: []
      }
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: user.id,
        reason: 'active_owner',
        emergencyDisabled: false
      })

      await expect(requireWriteAccess(ordinaryMutationEvent(user))).rejects.toMatchObject({
        statusCode: 503,
        statusMessage: 'God mode mutation coordination required'
      })
    })
  })

  describe('requirePricingAccess', () => {
    it.each(['owner', 'admin', 'project_manager'])('allows %s', async (role) => {
      const user = { id: 'u1', role, permissionGroups: [] }
      await expect(requirePricingAccess({ context: { user } } as any)).resolves.toMatchObject({ role })
    })

    it('throws 403 for a non-pricing role', async () => {
      const user = { id: 'u1', role: 'media_buyer', permissionGroups: [] }
      await expect(requirePricingAccess({ context: { user } } as any)).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  describe('getAuthUser', () => {
    it('is an alias for requireAuth (returns context user)', async () => {
      const user = { id: 'ctx', role: 'admin', permissionGroups: ['MANAGEMENT'] }
      await expect(getAuthUser({ context: { user } } as any)).resolves.toBe(user)
    })
  })

  // ── Entity / lookup helpers ─────────────────────────────────────────────
  describe('canAccessImplementation', () => {
    it('returns true when the user is PM or consultant on the implementation', async () => {
      mockQueryOne.mockResolvedValueOnce({ '?column?': 1 })
      await expect(canAccessImplementation('u1', 'impl-1')).resolves.toBe(true)
    })

    it('returns false when there is no matching row', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      await expect(canAccessImplementation('u1', 'impl-1')).resolves.toBe(false)
    })

    it('does not bypass the implementation assignment query for active owner authority', async () => {
      mockResolveGodModeAuthority.mockResolvedValue({
        active: true,
        actorUserId: '11111111-1111-4111-8111-111111111111',
        reason: 'active_owner',
        emergencyDisabled: false
      })
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(canAccessImplementation('11111111-1111-4111-8111-111111111111', 'impl-1')).resolves.toBe(false)
      expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('project_manager_id = $2'), [
        'impl-1',
        '11111111-1111-4111-8111-111111111111'
      ])
      expect(mockResolveGodModeAuthority).not.toHaveBeenCalled()
    })
  })

  describe('getUserByEmail', () => {
    it('looks up team_members by lowercased email', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'u1', email: 'a@b.c', role: 'admin' })
      const user = await getUserByEmail('A@B.C')
      expect(user?.id).toBe('u1')
      const [sql, params] = mockQueryOne.mock.calls[0]
      expect(String(sql)).toContain('FROM team_members')
      expect(params).toEqual(['a@b.c'])
    })
  })

  describe('getUserRoles', () => {
    it('returns the user role in an array', async () => {
      mockQueryOne.mockResolvedValueOnce({ role: 'admin' })
      await expect(getUserRoles('u1')).resolves.toEqual(['admin'])
    })

    it('returns [] when the user is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      await expect(getUserRoles('u1')).resolves.toEqual([])
    })
  })

  // ── Magic-link auth ─────────────────────────────────────────────────────
  describe('magic links', () => {
    it('generateMagicLink stores a token and returns the raw token', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'ml-1' })
      const token = await generateMagicLink('u1', 'User@Example.com')

      expect(token).toMatch(/^[0-9a-f]{64}$/i)
      const [sql, params] = mockQueryOne.mock.calls[0]
      expect(String(sql)).toContain('INSERT INTO magic_link_tokens')
      // token_hash is the SHA-256 digest, NOT the raw token (hardening #2).
      expect(params[1]).toBe(hashToken(token))
      expect(params[1]).not.toBe(token)
      expect(params[2]).toBe('user@example.com')
    })

    it('verifyMagicLink atomically claims a valid token and returns the user', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ user_id: 'u1', email: 'a@b.c' }) // atomic claim UPDATE...RETURNING
        .mockResolvedValueOnce({ id: 'u1', email: 'a@b.c', name: 'A', role: 'admin', is_active: true }) // user
        .mockResolvedValueOnce(null) // last_login update

      const user = await verifyMagicLink('rawtoken')
      expect(user?.id).toBe('u1')
      expect(String(mockQueryOne.mock.calls[0][0])).toContain('UPDATE magic_link_tokens')
    })

    it('verifyMagicLink returns null when the token cannot be claimed (used/expired)', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // claim fails
        .mockResolvedValueOnce({ used: true, expires_at: 'x', created_at: 'y' }) // diagnostic

      await expect(verifyMagicLink('rawtoken')).resolves.toBeNull()
    })

    it('invalidateUserMagicLinks deletes the user tokens', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      await invalidateUserMagicLinks('u1')
      const [sql, params] = mockQueryOne.mock.calls[0]
      expect(String(sql)).toContain('DELETE FROM magic_link_tokens')
      expect(params).toEqual(['u1'])
    })
  })
})
