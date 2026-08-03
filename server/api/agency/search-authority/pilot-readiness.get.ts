import { getQuery } from 'h3'
import { z } from 'zod'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { getSearchAuthorityPilotReadiness } from '~~/server/utils/searchAuthority/pilotReadiness'

const Query = z.object({
  clientId: z.string().uuid()
})

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid clientId is required'
    })
  }

  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  return getSearchAuthorityPilotReadiness(parsed.data.clientId)
})
