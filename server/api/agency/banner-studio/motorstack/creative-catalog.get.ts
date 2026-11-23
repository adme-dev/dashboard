import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getMotorstackCreativeCatalog } from '~~/server/utils/banner/motorstackCreativeCatalog'

const querySchema = z.object({ kitId: z.string().uuid(), kind: z.enum(['variants', 'offers']) }).strict()
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const input = querySchema.safeParse(getQuery(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Choose a valid brand kit and catalogue' })
  const { kit, ...catalog } = await getMotorstackCreativeCatalog(event, input.data)
  return catalog
})
