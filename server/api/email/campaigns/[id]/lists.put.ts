// server/api/email/campaigns/[id]/lists.put.ts
// Replace a draft campaign's target lists.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { setCampaignLists, getCampaignListIds } from '~~/server/utils/email-marketing/campaigns'

const Body = z.object({
  list_ids: z.array(z.string().uuid())
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  await setCampaignLists(id, parsed.data.list_ids)
  const list_ids = await getCampaignListIds(id)
  return { list_ids }
})
