import type { H3Event } from 'h3'
import { createError, getRequestURL } from 'h3'
import { requireClientAuth, type ServerClientUser } from '~~/server/utils/clientAuth'
import { requireClientEntitlement } from '~~/server/utils/billing/entitlements'
import { execute } from '~~/server/utils/db'

export type ClientCrmAccessLevel = 'view' | 'edit' | 'admin'

type CrmPermissionSubject = Pick<ServerClientUser, 'isPrimaryContact' | 'permissions'>

const INTERNAL_CRM_MODES = new Set(['lightweight_crm', 'full_crm'])
const CRM_API_PREFIX = '/api/client-portal/crm'
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const ADMIN_READ_PATHS = new Set([
  `${CRM_API_PREFIX}/audit`,
  `${CRM_API_PREFIX}/data-sources`,
  `${CRM_API_PREFIX}/export`
])
const ADMIN_MUTATION_PATHS = new Set([
  `${CRM_API_PREFIX}/bulk`,
  `${CRM_API_PREFIX}/custom-fields`,
  `${CRM_API_PREFIX}/data-sources`,
  `${CRM_API_PREFIX}/email-routes`,
  `${CRM_API_PREFIX}/people/import`
])
const CRM_ACCESS_CACHE = Symbol('client-crm-access-cache')

type ClientCrmAccessCache = Map<ClientCrmAccessLevel, ServerClientUser>

function accessCache(event: H3Event): ClientCrmAccessCache {
  const context = event.context as typeof event.context & {
    [CRM_ACCESS_CACHE]?: ClientCrmAccessCache
  }
  if (!context[CRM_ACCESS_CACHE]) {
    context[CRM_ACCESS_CACHE] = new Map()
  }
  return context[CRM_ACCESS_CACHE]
}

function isPathOrChild(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`)
}

export function resolveClientCrmAccessLevel(
  pathname: string,
  method: string
): ClientCrmAccessLevel {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'DELETE') return 'admin'

  if (READ_ONLY_METHODS.has(normalizedMethod)) {
    return [...ADMIN_READ_PATHS].some(path => isPathOrChild(pathname, path))
      ? 'admin'
      : 'view'
  }

  return [...ADMIN_MUTATION_PATHS].some(path => isPathOrChild(pathname, path))
    ? 'admin'
    : 'edit'
}

export function hasClientCrmPermission(
  subject: CrmPermissionSubject,
  required: ClientCrmAccessLevel
): boolean {
  const isAdmin = subject.isPrimaryContact || subject.permissions.canAdminCrm
  if (required === 'admin') return isAdmin
  if (required === 'edit') return isAdmin || subject.permissions.canEditCrm
  return isAdmin || subject.permissions.canEditCrm || subject.permissions.canViewCrm
}

async function recordAccessDecision(
  event: H3Event,
  client: ServerClientUser,
  required: ClientCrmAccessLevel,
  decision: 'allowed' | 'denied',
  reason: string | null
) {
  const { pathname } = getRequestURL(event)
  try {
    await execute(
      `INSERT INTO crm_security_audit_log (
         client_id, client_user_id, required_access, request_method,
         request_path, decision, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        client.clientId,
        client.id,
        required,
        event.method.toUpperCase(),
        pathname,
        decision,
        reason
      ]
    )
  } catch (error) {
    console.warn('[client-crm-access] Failed to record access decision', {
      clientId: client.clientId,
      clientUserId: client.id,
      required,
      decision,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function requireClientCrmAccess(
  event: H3Event,
  required: ClientCrmAccessLevel = 'view'
): Promise<ServerClientUser> {
  const cachedClient = accessCache(event).get(required)
  if (cachedClient) return cachedClient

  const client = await requireClientAuth(event)

  if (!INTERNAL_CRM_MODES.has(client.leadCaptureMode)) {
    await recordAccessDecision(event, client, required, 'denied', 'crm_mode_unavailable')
    throw createError({
      statusCode: 403,
      statusMessage: 'Client CRM is not enabled',
      data: { code: 'client_crm_unavailable' }
    })
  }

  try {
    await requireClientEntitlement(client.clientId, 'crm.core')
  } catch (error) {
    await recordAccessDecision(event, client, required, 'denied', 'crm_entitlement_inactive')
    throw error
  }

  if (!hasClientCrmPermission(client, required)) {
    await recordAccessDecision(event, client, required, 'denied', 'permission_denied')
    throw createError({
      statusCode: 403,
      statusMessage: `Client CRM ${required} permission required`,
      data: {
        code: 'client_crm_permission_required',
        requiredAccess: required
      }
    })
  }

  if (!READ_ONLY_METHODS.has(event.method.toUpperCase())) {
    await recordAccessDecision(event, client, required, 'allowed', null)
  }

  accessCache(event).set(required, client)
  return client
}
