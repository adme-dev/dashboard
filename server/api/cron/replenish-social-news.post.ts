import { requireSocialCronAuth } from '~~/server/utils/socialPublishing/cronAuth'
import { defineEventHandler } from 'h3'
import { checkNewsAutopost, dueNewsAutopostClients } from '~~/server/utils/socialNewsAutopost'

export default defineEventHandler(async (event) => {
  requireSocialCronAuth(event)
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
