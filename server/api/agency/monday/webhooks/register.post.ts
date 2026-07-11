import { createError, getRequestURL, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import { createMondayClient, type MondayWebhookEvent } from '~~/server/utils/mondayClient'

const OPERATIONAL_EVENTS: MondayWebhookEvent[] = [
  'create_item', 'change_column_value', 'change_name', 'item_archived', 'item_deleted', 'item_restored',
  'create_subitem', 'change_subitem_column_value', 'change_subitem_name', 'subitem_archived', 'subitem_deleted',
  'create_update', 'edit_update', 'delete_update', 'create_subitem_update',
]

/** Idempotently register signed app webhooks for every approved evidence board. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) throw createError({ statusCode: 409, statusMessage: 'An approved Monday evidence scope is required' })
  const connection = await resolveMondayConnection()
  if (!connection || connection.authMethod !== 'oauth') {
    throw createError({ statusCode: 409, statusMessage: 'Connect Monday through the XeroFlow OAuth app before registering signed webhooks' })
  }

  const webhookUrl = `${getRequestURL(event).origin}/api/webhooks/monday`
  const client = await createMondayClient(connection.accessToken)
  const results: Array<{
    boardId: string
    created: number
    existing: number
    failed: Array<{ event: MondayWebhookEvent; message: string }>
  }> = []

  for (const boardId of scope.board_ids) {
    const existing = await client.getWebhooks(boardId)
    const existingEvents = new Set(existing.map(webhook => webhook.event))
    let created = 0
    const failed: Array<{ event: MondayWebhookEvent; message: string }> = []
    for (const webhookEvent of OPERATIONAL_EVENTS) {
      if (existingEvents.has(webhookEvent)) continue
      try {
        await client.createWebhook(boardId, webhookUrl, webhookEvent)
        created++
      } catch (error) {
        failed.push({
          event: webhookEvent,
          message: error instanceof Error ? error.message : 'Monday rejected this webhook event',
        })
      }
    }
    results.push({ boardId, created, existing: existing.length, failed })
  }

  return {
    ok: results.every(board => board.failed.length === 0),
    webhookUrl,
    events: OPERATIONAL_EVENTS,
    boards: results,
  }
})
