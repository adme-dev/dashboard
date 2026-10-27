import { createError, type H3Event } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'
import { refreshableAccessToken, type PublishableAccount } from '~~/server/utils/socialPublishing'
import { queryTikTokCreatorPostCapabilities } from '~~/server/utils/social-providers/tiktok'
import { tikTokPayloadError } from '~~/shared/tiktokPosting'
import type { EffectiveSocialTarget } from './effectivePayload'
import type { SocialMediaAssetIdentity } from './mediaAssets'
/** Called only after caller has checked current client authority. No init request occurs here. */
export async function validateTikTokReviewedTargets(event: H3Event, clientId: string, targets: readonly EffectiveSocialTarget[], media: readonly SocialMediaAssetIdentity[]) {
  const selected = targets.filter(target => target.platform === 'tiktok')
  if (!selected.length) return
  const accounts = await queryRowsFresh<PublishableAccount>(`SELECT * FROM social_accounts
    WHERE client_id=$1 AND id=ANY($2::uuid[]) AND platform='tiktok' AND is_active=TRUE`, [clientId, selected.map(t => t.accountId)])
  for (const target of selected) {
    const account = accounts.find(a => a.id === target.accountId)
    if (!account) throw createError({ statusCode: 409, statusMessage: 'TikTok account changed; reconnect and review again' })
    if (target.options.consentAccountId !== account.platform_account_id) throw createError({ statusCode: 409, statusMessage: 'TikTok account changed; renew consent' })
    const token = await refreshableAccessToken(account, true, event)
    const creator = await queryTikTokCreatorPostCapabilities(token)
    const error = tikTokPayloadError(target.content, media, target.options, creator)
    if (error) throw createError({ statusCode: 400, statusMessage: error })
  }
}
