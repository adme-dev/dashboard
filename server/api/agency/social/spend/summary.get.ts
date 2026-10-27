import { readSpendSummary } from '~~/server/utils/ai/marketing/spendReads'
import { resolveBrowserMarketingReadScope } from '~~/server/utils/ai/marketing/readScope'
export default eventHandler(async (event) => {
  const scope = await resolveBrowserMarketingReadScope(event)
  const query = getQuery(event)
  const now = new Date()
  return readSpendSummary(scope, { month: Number(query.month || now.getMonth() + 1), year: Number(query.year || now.getFullYear()), platform: query.platform ? String(query.platform) : undefined, clientId: query.clientId ? String(query.clientId) : undefined })
})
