import { defineEventHandler } from 'h3'
import { engineJobAuthority } from '~~/server/utils/banner/engineJobs'
import { engineJobConfig, engineJobHttp, assertEngineServiceAuth, readEngineJobJson } from '~~/server/utils/banner/engineJobHttp'

export default defineEventHandler(event => engineJobHttp(event, async () => {
  const config = engineJobConfig(event)
  assertEngineServiceAuth(event, config)
  return engineJobAuthority(event).service(await readEngineJobJson(event))
}))
