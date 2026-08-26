import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { contentVersionInputSchema } from '~~/server/utils/searchAuthority/contentContracts'
import { createContentVersion } from '~~/server/utils/searchAuthority/contentRepository'
import { executeSearchAuthorityMutation } from '~~/server/utils/searchAuthority/godModeMutations'

const Body = contentVersionInputSchema.extend({ clientId: z.string().uuid() })
export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!assetId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid content version' })
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const asset = await queryOne<{ id: string }>(`SELECT id FROM search_authority_content_assets WHERE id = $1 AND client_id = $2`, [assetId.data, parsed.data.clientId])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  return executeSearchAuthorityMutation(event, 'version-create',
    db => createContentVersion(db, { ...parsed.data, assetId: assetId.data, actorId: user.id }),
    async (db, id) => {
      const row = await db.query(`SELECT id, version_number FROM search_authority_content_versions WHERE id = $1 AND client_id = $2`, [id, parsed.data.clientId])
      const version = row.rows[0] as { id: string, version_number: number } | undefined
      if (!version) throw new Error('Replayed content version no longer exists')
      return { id: version.id, versionNumber: Number(version.version_number) }
    })
})
