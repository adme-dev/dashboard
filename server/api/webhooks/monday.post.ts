import { createError, readBody, getRequestHeader, setHeader } from 'h3'
import { execute } from '~~/server/utils/db'
import { verifyMondayWebhookJwt } from '~~/server/utils/mondayWebhook'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const body = await readBody<any>(event)
  if (body?.challenge) return { challenge: body.challenge }
  const secret = process.env.MONDAY_SIGNING_SECRET
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Monday webhook signing secret is not configured' })
  const authorization = getRequestHeader(event, 'authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  const claims = await verifyMondayWebhookJwt(token, secret)
  if (!claims) throw createError({ statusCode: 401, statusMessage: 'Invalid Monday webhook signature' })
  const eventId = getRequestHeader(event, 'x-apps-event-id') || String(body?.event?.id || body?.id || '')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Monday webhook event ID is required' })
  await execute(
    `INSERT INTO monday_webhook_events (monday_event_id, event_type, board_id, item_id, payload, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'queued') ON CONFLICT (monday_event_id) DO NOTHING`,
    [eventId, body?.event?.type || body?.type || null, body?.event?.boardId || body?.event?.board_id || null, body?.event?.pulseId || body?.event?.itemId || null, JSON.stringify(body)],
  )
  return { ok: true, queued: true, eventId }
})
