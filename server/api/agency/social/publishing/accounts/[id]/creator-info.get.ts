import { requireFreshSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { queryOneFresh } from '~~/server/utils/db'
import { refreshableAccessToken, type PublishableAccount } from '~~/server/utils/socialPublishing'
import { queryTikTokCreatorPostCapabilities } from '~~/server/utils/social-providers/tiktok'

export default defineEventHandler(async (event) => {
  const clientId = String(getQuery(event).clientId ?? '')
  const { context } = await requireFreshSocialClientAccess(event, clientId)
  if (context.assistantReadOnly) throw createError({ statusCode: 403, statusMessage: 'Current role does not permit creator preparation' })
  const account = await queryOneFresh<PublishableAccount>(`SELECT * FROM social_accounts
    WHERE id=$1 AND client_id=$2 AND platform='tiktok' AND is_active=TRUE`, [getRouterParam(event, 'id'), clientId])
  if (!account) throw createError({ statusCode: 404, statusMessage: 'TikTok account not found' })
  try {
    return await queryTikTokCreatorPostCapabilities(await refreshableAccessToken(account, true, event))
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'TikTok creator settings unavailable. Check the account connection.' })
  }
})
