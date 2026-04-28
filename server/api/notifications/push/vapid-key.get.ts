/**
 * GET /api/notifications/push/vapid-key
 * Returns the VAPID public key in the format the browser's PushManager
 * expects as `applicationServerKey` (base64url of uncompressed P-256 point).
 */

import { getVapidPublicKeyForBrowser } from '~~/server/utils/webPush'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const key = getVapidPublicKeyForBrowser()
  if (!key) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Web Push is not configured on this server',
    })
  }
  return { publicKey: key }
})
