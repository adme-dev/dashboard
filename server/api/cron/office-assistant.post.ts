/**
 * POST /api/cron/office-assistant
 * Evaluates due office assistant watches across offices.
 */
import { queryRows } from '~~/server/utils/db'
import {
  ensureOfficeAssistantEvaluatorTables,
  evaluateOfficeAssistantWatches
} from '~~/server/utils/officeAssistantEvaluator'

interface OfficeRow {
  office_id: string
}

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  await ensureOfficeAssistantEvaluatorTables()

  const offices = await queryRows<OfficeRow>(
    `SELECT DISTINCT office_id::text
     FROM office_assistant_watches
     WHERE status = 'active'
       AND (
         last_triggered_at IS NULL
         OR last_triggered_at < now() - interval '15 minutes'
       )
     ORDER BY office_id
     LIMIT 25`
  )

  let evaluated = 0
  let triggered = 0
  const results = []
  for (const office of offices) {
    try {
      const result = await evaluateOfficeAssistantWatches({
        officeId: office.office_id,
        limit: 100
      })
      evaluated += result.evaluated
      triggered += result.triggered.length
      results.push({
        officeId: office.office_id,
        evaluated: result.evaluated,
        triggered: result.triggered.length
      })
    } catch (error) {
      console.error('[office-assistant-cron] office evaluation failed:', office.office_id, error)
      results.push({
        officeId: office.office_id,
        evaluated: 0,
        triggered: 0,
        error: 'evaluation_failed'
      })
    }
  }

  return {
    ok: true,
    offices: offices.length,
    evaluated,
    triggered,
    results
  }
})
