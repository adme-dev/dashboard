// server/api/email/campaigns/[id]/materialize.post.ts
// Build (or refresh) the campaign's recipient work queue from its target lists.
// Does NOT send anything — just computes who would be emailed and sets to_send.
import { requireWriteAccess } from '~~/server/utils/auth'
import { materializeRecipients } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const to_send = await materializeRecipients(id)
  return { to_send }
})
