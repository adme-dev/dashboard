import { requireAuth } from '~~/server/utils/auth'
import { listFormMetadata } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return { items: await listFormMetadata() }
})
