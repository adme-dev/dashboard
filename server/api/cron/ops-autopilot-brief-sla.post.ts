// server/api/cron/ops-autopilot-brief-sla.post.ts
// C7 daily brief-SLA sweep. Notify-only (escalations + briefer alerts); no platform/task writes.
// DORMANT: no-ops unless C7_CONFIRMATION_ENABLED=true; NOT registered in workers/pages-cron.
import { createError, getHeader, getQuery } from 'h3'
import { runBriefSlaSweep } from '~~/server/utils/automation/actionedConfirmationRunner'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'
  const start = Date.now()
  const result = await runBriefSlaSweep({ now: new Date(), force })
  return { ok: true, durationMs: Date.now() - start, ...result }
})
