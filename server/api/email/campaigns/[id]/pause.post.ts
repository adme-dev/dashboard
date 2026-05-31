// server/api/email/campaigns/[id]/pause.post.ts
// Pause an in-flight send (sending → paused). Stops claiming new chunks; all
// per-recipient state persists, so resume just re-enters sending.
import { requireWriteAccess } from '~~/server/utils/auth'
import { setCampaignStatus } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await setCampaignStatus(id, 'paused')
  return { status: 'paused' }
})
