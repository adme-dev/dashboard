import { requireAuth } from '~~/server/utils/auth'
import { listVersions } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const versions = await listVersions(id)
  return { versions }
})
