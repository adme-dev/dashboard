import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { searchConsoleOpportunityWindow } from '~~/server/utils/searchAuthority/dates'
import { listSearchAuthorityClientIds } from '~~/server/utils/searchAuthority/feature'
import { inspectPriorityUrls } from '~~/server/utils/searchAuthority/inspection'
import { generateSearchAuthorityOpportunities } from '~~/server/utils/searchAuthority/opportunities'
import { syncSearchConsoleClient } from '~~/server/utils/searchAuthority/sync'

export default defineEventHandler(async (event) => {
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const clientIds = await listSearchAuthorityClientIds()
  const work = Promise.all(clientIds.map(async (clientId) => {
    await syncSearchConsoleClient({
      clientId,
      triggerType: 'scheduled'
    })
    await generateSearchAuthorityOpportunities(
      clientId,
      searchConsoleOpportunityWindow()
    )
    return inspectPriorityUrls(clientId, 50)
  }))
  runAfterResponse(event, work, 'search-console-daily-sync')

  return {
    ok: true,
    queuedClients: clientIds.length
  }
})
