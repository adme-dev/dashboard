// server/api/email/campaigns/[id]/lists.put.ts
// Replace a draft campaign's target lists.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import {
  assertEmailClientAccess,
  assertScopedCampaignLists
} from '~~/server/utils/email-marketing/access'
import { getListClientIds } from '~~/server/utils/email-marketing/db'
import { getCampaign, setCampaignLists, getCampaignListIds } from '~~/server/utils/email-marketing/campaigns'

const Body = z.object({
  list_ids: z.array(z.string().uuid())
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  const listIds = Array.from(new Set(parsed.data.list_ids))
  const lists = await getListClientIds(listIds)
  if (lists.length !== listIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'list_not_found' })
  }
  assertScopedCampaignLists(user, campaign.client_id, lists)
  await setCampaignLists(id, listIds)
  const list_ids = await getCampaignListIds(id)
  return { list_ids }
})
