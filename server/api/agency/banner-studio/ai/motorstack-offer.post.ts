import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOneFresh } from '~~/server/utils/db'
import { requireBannerClientScope } from '~~/server/utils/banner/clientAccess'
import { resolveMotorstackDesignOffer } from '~~/server/utils/banner/motorstackDesign'
import { importMedia, mediaBinding } from '~~/server/utils/banner/motorstackMedia'

const schema = z.object({ projectId: z.string().uuid(), kitId: z.string().uuid(), offerId: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  await requireWriteAccess(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a saved project and current MotorStack offer.' })
  const project = await queryOneFresh<{ client_id: string | null }>('SELECT client_id FROM banner_projects WHERE id = $1', [parsed.data.projectId])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  await requireBannerClientScope(event, project.client_id ?? undefined)
  const source = await resolveMotorstackDesignOffer(event, parsed.data, project.client_id)
  const imported = source.offer.artworkAssetId
    ? await importMedia(event, mediaBinding(event), { brandId: source.brandId, assetId: source.offer.artworkAssetId }, user.id)
    : null
  return { assetId: imported?.asset.id || null, offerId: source.offer.id }
})
