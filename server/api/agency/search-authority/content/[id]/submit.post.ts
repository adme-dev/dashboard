import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { submitContentVersion } from '~~/server/utils/searchAuthority/contentRepository'
import { executeSearchAuthorityMutation } from '~~/server/utils/searchAuthority/godModeMutations'

const Body = z.object({ clientId: z.string().uuid(), versionId: z.string().uuid() })
export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!assetId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid review submission' })
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const asset = await queryOne<{ id: string }>(`SELECT id FROM search_authority_content_assets WHERE id = $1 AND client_id = $2`, [assetId.data, parsed.data.clientId])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  const result = await executeSearchAuthorityMutation(event, 'version-submit', async (db) => {
    await submitContentVersion(db, { ...parsed.data, assetId: assetId.data, actorId: user.id })
    return { id: parsed.data.versionId, ok: true, status: 'in_review' as const }
  }, async (_db, id) => ({ id, ok: true, status: 'in_review' as const }))
  return { ok: result.ok, status: result.status }
})
