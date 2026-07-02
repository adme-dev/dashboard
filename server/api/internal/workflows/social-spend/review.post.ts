import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import {
  buildPacingReview,
  PACING_REVIEW_SELECT_COLUMNS,
  type PacingReviewRow
} from '~~/server/utils/socialSpendPacingReview'
import {
  SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
  normalizeSocialSpendReviewWorkflowPayload
} from '~~/server/utils/agencyWorkflows/socialSpendReview'

/**
 * POST /api/internal/workflows/social-spend/review
 *
 * Durable read-only spend review callback for the agency-workflows Worker.
 * Budget changes stay in the existing human approval chain; this callback only
 * runs the canonical pacing review and returns an operator-visible summary.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.period = $1
       AND ms.platform IN ('meta', 'google_ads')
       ${payload.scope === 'client' ? 'AND ms.client_id = $2' : ''}
       ${payload.scope === 'platform' ? 'AND ms.platform = $2' : ''}
     ORDER BY ms.actual_spend DESC`,
    spendReviewParams(payload)
  )
  const review = buildPacingReview(rows, { now: new Date(), period: payload.period })

  console.info('agency-workflows.social-spend.review.completed', {
    period: payload.period,
    scope: payload.scope,
    clientId: payload.clientId,
    platform: payload.platform,
    itemCount: review.items.length,
    criticalCount: review.summary.criticalCount,
    warningCount: review.summary.warningCount
  })

  return {
    ok: true,
    workflow: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
    period: payload.period,
    scope: payload.scope,
    clientId: payload.clientId ?? null,
    platform: payload.platform ?? 'all',
    result: {
      ok: true,
      itemCount: review.items.length,
      summary: review.summary
    }
  }
})

function spendReviewParams(payload: ReturnType<typeof normalizeSocialSpendReviewWorkflowPayload>): string[] {
  if (payload.scope === 'client') return [payload.period, payload.clientId as string]
  if (payload.scope === 'platform') return [payload.period, payload.platform as string]
  return [payload.period]
}

function requireWorkflowCallbackSecret(event: H3Event) {
  const expected = process.env.WORKFLOW_CALLBACK_SECRET?.trim() || process.env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'WORKFLOW_CALLBACK_SECRET is not configured' })
  }
  if (getHeader(event, 'x-workflow-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

async function readWorkflowPayload(event: H3Event) {
  try {
    return normalizeSocialSpendReviewWorkflowPayload(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid workflow payload'
    })
  }
}
