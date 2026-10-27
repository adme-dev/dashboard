import { defineEventHandler, getRouterParam } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { engineJobAuthority } from '~~/server/utils/banner/engineJobs'
import { engineJobHttp, readEngineJobJson } from '~~/server/utils/banner/engineJobHttp'
import { ENGINE_JOB_LIMITS } from '../../../../../../shared/bannerEngineJobs'

export default defineEventHandler(event => engineJobHttp(event, async () => {
  const actor = await requireWriteAccess(event)
  const authority = engineJobAuthority(event)
  return authority.cancel(actor, getRouterParam(event, 'jobId') ?? '', await readEngineJobJson(event, ENGINE_JOB_LIMITS.controlBytes))
}))
