import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'

export async function assertSocialCampaign(clientId: string, campaignId: unknown) {
  if (campaignId === undefined || campaignId === null) return
  const parsed = z.string().uuid().safeParse(campaignId)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Valid campaignId required' })
  const campaign = await queryOneFresh('SELECT id FROM social_campaigns WHERE id = $1 AND client_id::text = $2', [parsed.data, clientId])
  if (!campaign) throw createError({ statusCode: 400, statusMessage: 'Campaign is not available for this client' })
}
