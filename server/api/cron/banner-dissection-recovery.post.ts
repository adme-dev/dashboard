import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getHeader } from 'h3'
import { recoverDissectionDispatches } from '~~/server/utils/banner/dissectionRecovery'

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  // A deployed binding bag is authoritative, including absent/empty values.
  const runtime = env === undefined ? process.env : env
  const secret = runtime.CRON_SECRET
  const supplied = getHeader(event, 'x-cron-secret')
  // Mandatory in development, preview and production, including disabled invocations.
  if (typeof secret !== 'string' || !secret.length || !supplied
    || Buffer.byteLength(secret) !== Buffer.byteLength(supplied)
    || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const enabled = runtime.BANNER_DISSECTION_RECOVERY_ENABLED
  if (enabled !== 'true') return { ran: false, reason: 'disabled' }
  try {
    return await recoverDissectionDispatches(event)
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Dissection recovery unavailable' })
  }
})
