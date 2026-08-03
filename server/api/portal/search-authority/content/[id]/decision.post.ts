import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import { requirePortalSearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { approveContentVersion, rejectContentVersion } from '~~/server/utils/searchAuthority/contentRepository'

const Body = z.object({
  decision: z.enum(['approved', 'rejected']),
  versionId: z.string().uuid(),
  rationale: z.string().trim().min(5).max(2000)
})

export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const body = Body.safeParse(await readBody(event))
  if (!assetId.success || !body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content decision' })
  }
  const user = await requirePortalSearchAuthorityAccess(event)
  if (!user.permissions.canApproveWork) {
    throw createError({ statusCode: 403, statusMessage: 'Approval permission is required' })
  }
  const asset = await queryOne<{ current_version_id: string, status: string }>(`
    SELECT current_version_id, status
    FROM search_authority_content_assets
    WHERE id = $1 AND client_id = $2
  `, [assetId.data, user.clientId])
  if (!asset || asset.current_version_id !== body.data.versionId || asset.status !== 'in_review') {
    throw createError({ statusCode: 404, statusMessage: 'Current content review not found' })
  }

  const decision = {
    clientId: user.clientId,
    assetId: assetId.data,
    versionId: body.data.versionId,
    actorId: user.id,
    actorType: 'portal' as const,
    rationale: body.data.rationale
  }
  await transaction(db => body.data.decision === 'approved'
    ? approveContentVersion(db, decision)
    : rejectContentVersion(db, decision))
  return { ok: true, status: body.data.decision }
})
