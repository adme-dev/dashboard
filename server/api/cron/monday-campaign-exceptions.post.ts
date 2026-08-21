import { getHeader } from 'h3'
import { runMondayCampaignExceptionAutomation } from '~~/server/utils/mondayCampaignExceptionAutomation'

export default eventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret') || ''
  if (!import.meta.dev && (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return await runMondayCampaignExceptionAutomation({ cronSecret })
})
