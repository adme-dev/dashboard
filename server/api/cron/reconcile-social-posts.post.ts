import { requireSocialCronAuth } from '~~/server/utils/socialPublishing/cronAuth'
import { reconcileDueSocialPostTargets } from '~~/server/utils/socialPublishing/reconciliation'
export default defineEventHandler(async event => {
  requireSocialCronAuth(event)
  return await reconcileDueSocialPostTargets({ event })
})
