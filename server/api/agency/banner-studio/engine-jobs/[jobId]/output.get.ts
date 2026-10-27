import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { engineJobAuthority } from '~~/server/utils/banner/engineJobs'
import { engineJobHttp } from '~~/server/utils/banner/engineJobHttp'

export default defineEventHandler(event => engineJobHttp(event, async () => {
  const actor = await requireAuth(event)
  const bytes = await engineJobAuthority(event).output(actor, getRouterParam(event, 'jobId') ?? '')
  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Content-Disposition', 'attachment; filename="engine-preview.png"')
  return bytes
}))
