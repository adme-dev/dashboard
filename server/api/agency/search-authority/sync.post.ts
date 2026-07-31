import { z } from 'zod'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { searchConsoleSyncWindow } from '~~/server/utils/searchAuthority/dates'
import { syncSearchConsoleClient } from '~~/server/utils/searchAuthority/sync'

const Body = z.object({
  clientId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
}).refine(input => Boolean(input.startDate) === Boolean(input.endDate), {
  message: 'Both startDate and endDate are required for a manual range'
})

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Search Console sync request'
    })
  }
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)

  const window = parsed.data.startDate
    ? (() => {
        try {
          return searchConsoleSyncWindow({
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
            maxManualDays: 30
          })
        } catch (error: unknown) {
          throw createError({
            statusCode: 400,
            statusMessage: error instanceof Error
              ? error.message
              : 'Invalid Search Console sync range'
          })
        }
      })()
    : null

  return runSpendSyncInBackground(event, {
    label: window
      ? `search-authority sync ${parsed.data.clientId} ${window.startDate}..${window.endDate}`
      : `search-authority sync ${parsed.data.clientId} automatic-window`,
    sync: () => syncSearchConsoleClient({
      clientId: parsed.data.clientId,
      startDate: window?.startDate,
      endDate: window?.endDate,
      triggerType: 'manual'
    }),
    kvKeys: [],
    extra: { clientId: parsed.data.clientId }
  })
})
