import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { runAutomationForConversation, type EngineDb, type EngineDeps } from '~~/server/utils/socialInbox/automation'
import { generateReplyDraft } from '~~/server/utils/socialInbox/aiDraft'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  normalizeSocialInboxAutomationWorkflowPayload
} from '~~/server/utils/agencyWorkflows/socialInboxAutomation'

const inboxAutomationDb: EngineDb = { queryOne, queryRows, execute }
const inboxAutomationDeps: EngineDeps = {
  generateDraft: generateReplyDraft,
  dispatch: args => dispatchReply(inboxAutomationDb, args.conversationId, {
    content: args.content,
    sentByUserId: 'automation',
    aiGenerated: args.aiGenerated
  })
}

/**
 * POST /api/internal/workflows/social-inbox/automation
 *
 * Pages-side callback for the standalone agency-workflows Worker. The Worker
 * owns durable retry orchestration; Pages owns tenant-scoped conversation reads,
 * drafting, and provider reply dispatch through the shared automation engine.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const conversation = await queryOne<{ id: string }>(
    `SELECT id FROM social_conversations WHERE id = $1 AND client_id = $2`,
    [payload.conversationId, payload.clientId]
  )

  if (!conversation) {
    return {
      ok: true,
      workflow: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      conversationId: payload.conversationId,
      clientId: payload.clientId,
      messageId: payload.messageId ?? null,
      result: {
        ok: true,
        skipped: true,
        reason: 'conversation_not_found'
      }
    }
  }

  await runAutomationForConversation(inboxAutomationDb, inboxAutomationDeps, payload.conversationId)

  return {
    ok: true,
    workflow: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
    conversationId: payload.conversationId,
    clientId: payload.clientId,
    messageId: payload.messageId ?? null,
    result: { ok: true }
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
    return normalizeSocialInboxAutomationWorkflowPayload(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid workflow payload'
    })
  }
}
