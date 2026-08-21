import { getHeader } from 'h3'
import { MondayAutomationWriteScopeRequiredError, runMondayCampaignExceptionAutomation } from '~~/server/utils/mondayCampaignExceptionAutomation'

export default eventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret') || ''
  if (!import.meta.dev && (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  try {
    return await runMondayCampaignExceptionAutomation({ cronSecret })
  } catch (error) {
    if (error instanceof MondayAutomationWriteScopeRequiredError) {
      return {
        ok: false,
        blocked: true,
        code: error.code,
        message: error.message,
        reconnectUrl: '/api/agency/monday/oauth/start',
      }
    }
    throw error
  }
})
