// Daily ad-spend sync cron entrypoint.
//
// Auth: x-cron-secret vs CRON_SECRET (same as every other /api/cron/* route,
// driven by the pages-cron worker). This replaces the old ai-agent-worker →
// /api/internal/sync-spend path, which ran every platform synchronously in one
// request and never completed on Cloudflare (the cron has never once written
// data). Here we kick off a background sync per platform and return
// immediately, so the cron call can't hit the function time limit.
import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { startSpendSyncAllPlatforms } from '~~/server/utils/spendSyncKickoff'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const q = getQuery(event)
  const now = new Date()
  const month = parseInt(String(q.month || now.getMonth() + 1), 10)
  const year = parseInt(String(q.year || now.getFullYear()), 10)

  const result = await startSpendSyncAllPlatforms(event, month, year)
  return { ok: true, started: true, ...result }
})
