import { defineEventHandler, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { engineJobAuthority } from '~~/server/utils/banner/engineJobs'
import { engineJobHttp } from '~~/server/utils/banner/engineJobHttp'

export default defineEventHandler(event => engineJobHttp(event, async () => {
  const actor = await requireAuth(event)
  return engineJobAuthority(event).status(actor, getRouterParam(event, 'jobId') ?? '')
}))
