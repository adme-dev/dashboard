import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getCookie, getHeader, getRequestURL } from 'h3'

import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import {
  GodModeMutationCoordinationError,
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '~~/server/utils/godMode/featureGate'

const EXCLUDED_PREFIXES = [
  '/api/portal/',
  '/api/client-portal/',
  '/api/public/',
  '/api/webhooks',
  '/api/leads/webhook/',
  '/api/leads/_internal/',
  '/api/cron/',
  '/api/export/',
  '/api/internal/mcp/',
  '/api/mcp/',
  '/api/_nuxt_icon',
  '/_nuxt',
  '/__nuxt_devtools__'
]

const EXCLUDED_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/magic-link',
  '/api/auth/dev-login',
  '/api/auth/xeroflow',
  '/api/admin/create-super-admin',
  '/api/admin/magic-link-debug',
  '/api/test/cookies',
  '/api/xero/callback',
  '/api/health'
])

interface GodModeMiddlewareDependencies {
  resolveGodModeAuthority: typeof resolveGodModeAuthority
  appendGodModeAuditEvent: typeof appendGodModeAuditEvent
  getSessionToken: (event: H3Event) => string | null
  randomUUID: () => string
}

const defaultDependencies: GodModeMiddlewareDependencies = {
  resolveGodModeAuthority,
  appendGodModeAuditEvent,
  getSessionToken: (event) => {
    const cookieToken = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
    const authorization = getHeader(event, 'authorization')
    return cookieToken || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  },
  randomUUID
}

function isExcluded(path: string): boolean {
  return !path.startsWith('/api/')
    || EXCLUDED_EXACT.has(path)
    || EXCLUDED_PREFIXES.some((prefix) => {
      const segment = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
      return path === segment || path.startsWith(`${segment}/`)
    })
}

export async function handleGodModeRequest(
  event: H3Event,
  dependencies: GodModeMiddlewareDependencies = defaultDependencies
): Promise<void> {
  const path = getRequestURL(event).pathname
  if (isExcluded(path)) return

  const actorUserId = (event.context as any).user?.id
  if (typeof actorUserId !== 'string') return

  const authority = await dependencies.resolveGodModeAuthority(event, actorUserId)
  if (!authority.active) return

  const sessionToken = dependencies.getSessionToken(event)
  if (!sessionToken) {
    throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  }

  const routeOrTool = `${String(event.method || 'GET').toUpperCase()} ${path}`
  const correlationId = dependencies.randomUUID()
  const sessionDigest = createHash('sha256').update(sessionToken).digest('hex')

  try {
    await dependencies.appendGodModeAuditEvent({
      actorUserId,
      correlationId,
      sessionDigest,
      channel: 'application',
      routeOrTool,
      phase: 'attempt',
      bypassedControls: [],
      outcomeCode: 'started',
      emergencyDisabled: false
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  }

  seedGodModeRouteAuditState(event, {
    actorUserId,
    correlationId,
    sessionDigest,
    routeOrTool,
    emergencyDisabled: false
  }, {
    appendGodModeAuditEvent: dependencies.appendGodModeAuditEvent
  })

  try {
    await prepareRegisteredGodModeMutation(event)
  } catch (error) {
    if (error instanceof GodModeMutationCoordinationError && error.reason === 'required') {
      throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination required' })
    }
    throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  }
}

export default defineEventHandler(handleGodModeRequest)
