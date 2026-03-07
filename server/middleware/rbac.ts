import { isReadOnlyRole } from '../utils/permissions'

/**
 * RBAC middleware: blocks all POST/PUT/PATCH/DELETE from viewer/guest roles.
 * Runs after auth.ts (alphabetical: "rbac" > "auth") so event.context.user is set.
 *
 * Exempt paths:
 *  - /api/auth/logout  (users must be able to log out)
 *  - /api/notifications/ (marking as read)
 *  - /api/portal/       (client portal has its own auth)
 */

const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/notifications/',
  '/api/portal/',
  '/api/webhooks',
  '/api/xero/webhook',
  '/api/internal/',
]

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)

  // Only gate /api/* routes
  if (!pathname.startsWith('/api/')) return

  // Allow read-only HTTP methods
  const method = event.method.toUpperCase()
  if (READ_ONLY_METHODS.has(method)) return

  // Allow exempt paths
  if (EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))) return

  // Check if user is a read-only role
  const user = event.context.user
  if (!user) return // auth middleware will handle unauthenticated

  // Check system read-only roles (viewer/guest) or custom roles with is_read_only flag
  if (isReadOnlyRole(user.role) || user.isCustomReadOnly) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden - Read-only access.',
    })
  }
})
