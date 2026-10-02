import { createError, defineEventHandler, getHeader } from 'h3'
import { checkNewsAutopost, dueNewsAutopostClients } from '~~/server/utils/socialNewsAutopost'

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const secret = env?.CRON_SECRET ?? process.env.CRON_SECRET
  if (!import.meta.dev && (typeof secret !== 'string' || !secret || getHeader(event, 'x-cron-secret') !== secret)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const clients = await dueNewsAutopostClients()
  const results = []
  for (const clientId of clients) {
    try {
      results.push({ clientId, result: await checkNewsAutopost(clientId) })
    } catch { results.push({ clientId, error: 'News check failed; automatic retry is scheduled.' }) }
  }
  console.log('social-news-autopost.run', { checked: clients.length, errors: results.filter(result => 'error' in result).length })
  return { checked: clients.length, results }
})
