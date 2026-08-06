/**
 * Start an agency-managed client portal session.
 * POST /api/agency/client-portal/access
 */

import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireRole } from '~~/server/utils/auth'
import { executeClientPortalAccess } from '~~/server/utils/clientPortal/access'

interface AccessClientPortalBody {
  clientId?: string
}

export default defineEventHandler(async (event) => {
  const agencyUser = await requireRole(event, [
    ...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])
  ])
  const body = await readBody<AccessClientPortalBody>(event)
  const clientId = body.clientId

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    const headers = getHeaders(event)
    const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || null
    const userAgent = headers['user-agent'] || null
    const access = await executeClientPortalAccess(event, agencyUser, clientId, ipAddress, userAgent)
    const remainingSessionSeconds = Math.max(
      1,
      Math.min(8 * 60 * 60, Math.floor((new Date(access.expiresAt).getTime() - Date.now()) / 1000))
    )

    setCookie(event, 'client_session_token', access.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: remainingSessionSeconds,
      path: '/'
    })

    return {
      ok: true,
      portalUrl: '/portal',
      client: access.client,
      user: access.user
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'statusCode' in error) throw error
    console.error('Failed to start agency portal access:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to open client portal'
    })
  }
})
