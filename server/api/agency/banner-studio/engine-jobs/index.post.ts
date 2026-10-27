import { defineEventHandler } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { engineJobAuthority } from '~~/server/utils/banner/engineJobs'
import { engineJobConfig, engineJobHttp, readEngineJobJson } from '~~/server/utils/banner/engineJobHttp'

export default defineEventHandler(event => engineJobHttp(event, async () => {
  const actor = await requireWriteAccess(event)
  engineJobConfig(event)
  await enforceRateLimit(event, { key: `banner-engine-submit:${actor.id}`, limit: 10, windowSeconds: 60, failureMode: 'closed' })
  return engineJobAuthority(event).submit(actor, await readEngineJobJson(event))
}))
