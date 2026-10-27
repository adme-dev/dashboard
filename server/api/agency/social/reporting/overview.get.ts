import { readSocialOverview } from '~~/server/utils/ai/marketing/socialReads'
import { resolveBrowserMarketingReadScope } from '~~/server/utils/ai/marketing/readScope'

export default defineEventHandler(async (event) => {
  const scope = await resolveBrowserMarketingReadScope(event)
  const q = getQuery(event)
  if (!q.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const to = q.to ? String(q.to) : new Date().toISOString()
  const from = q.from ? String(q.from) : ''
  return readSocialOverview(scope, { clientId: String(q.clientId), from, to, platform: q.platform ? String(q.platform) : null })
})
