import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { scoreBriefCompleteness } from '~~/server/utils/aiBriefScoring'
import { decideBriefGate } from '~~/server/utils/automation/briefGatekeeper'
import {
  BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
  normalizeBriefLifecycleCheckWorkflowPayload
} from '~~/server/utils/agencyWorkflows/briefLifecycleCheck'

/**
 * POST /api/internal/workflows/briefs/lifecycle-check
 *
 * Durable read-only brief lifecycle callback for the agency-workflows Worker.
 * It evaluates the existing completeness gate and returns operator-visible
 * evidence. It does not convert briefs, assign users, comment, or notify.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const brief = await queryOne<{
    id: string
    client_id: string | null
    status: string | null
    title: string | null
  }>(
    `SELECT id::text AS id, client_id::text AS client_id, status, title
       FROM briefs
      WHERE id = $1
        ${payload.clientId ? 'AND client_id = $2' : ''}`,
    payload.clientId ? [payload.briefId, payload.clientId] : [payload.briefId]
  )

  if (!brief) {
    return {
      ok: true,
      workflow: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
      briefId: payload.briefId,
      clientId: payload.clientId ?? null,
      result: {
        ok: true,
        skipped: true,
        reason: 'brief_not_found'
      }
    }
  }

  const score = await scoreBriefCompleteness(payload.briefId)
  const decision = decideBriefGate(score)

  console.info('agency-workflows.brief-lifecycle.check.completed', {
    briefId: payload.briefId,
    clientId: brief.client_id,
    status: brief.status,
    gate: decision.gate,
    overall: score.overall,
    missingRequired: decision.missingRequired.length
  })

  return {
    ok: true,
    workflow: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
    briefId: payload.briefId,
    clientId: brief.client_id,
    result: {
      ok: true,
      status: brief.status,
      title: brief.title,
      gate: decision.gate,
      overall: score.overall,
      requiredComplete: decision.requiredComplete,
      missingRequired: decision.missingRequired,
      recommendations: decision.recommendations.slice(0, 8)
    }
  }
})

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
    return normalizeBriefLifecycleCheckWorkflowPayload(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid workflow payload'
    })
  }
}
