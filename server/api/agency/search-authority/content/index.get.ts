import { getQuery } from 'h3'
import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Query = z.object({ clientId: z.string().uuid() })
export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const assets = await queryRows(`SELECT asset.id, asset.slug, asset.title, asset.topic, asset.status,
    asset.current_version_id, asset.updated_at
    FROM search_authority_content_assets asset WHERE asset.client_id = $1
    ORDER BY asset.updated_at DESC`, [parsed.data.clientId])
  return { assets }
})
