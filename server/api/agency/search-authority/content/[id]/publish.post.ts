import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { publishSearchAuthorityContent } from '~~/server/utils/searchAuthority/contentPublication'

const Body = z.object({ clientId: z.string().uuid() })

export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const body = Body.safeParse(await readBody(event))
  if (!assetId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid publication request' })
  }
  const user = await requireAgencySearchAuthorityAccess(event, body.data.clientId)
  // Approved-version, hostname, storage, R2 activation, pointer restore and audit live in the
  // shared publication service so the department MCP path cannot drift from this route.
  return publishSearchAuthorityContent(event, {
    clientId: body.data.clientId,
    assetId: assetId.data,
    actorId: user.id
  })
})
