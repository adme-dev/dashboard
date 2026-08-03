import { getHeader } from 'h3'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import {
  isGoogleBusinessPerformanceEnabled,
  syncGoogleBusinessPerformance
} from '~~/server/utils/social-providers/google-business-performance'

export default defineEventHandler(async (event) => {
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!import.meta.dev && (!expectedSecret || suppliedSecret !== expectedSecret)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const enabled = isGoogleBusinessPerformanceEnabled(event)
  if (!enabled) return { ok: true, enabled: false, queued: false }

  const work = syncGoogleBusinessPerformance({ event })
  runAfterResponse(event, work, 'google-business-performance-sync')
  return { ok: true, enabled: true, queued: true }
})
