// GET /api/public/email/lookup?c=&s=&t=
// Public, token-gated read for the unsubscribe page: validates the signed unsub
// link and returns the subscriber's email + list memberships so the page can
// show "you're unsubscribing <email>" and render the preference center. No
// session — the HMAC token in the link is the authorization.
import { emailLinkSecret, verifyEmailToken } from '~~/server/utils/email-marketing/links'
import { getSubscriberWithLists } from '~~/server/utils/email-marketing/subscriptions'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const campaignId = typeof q.c === 'string' ? q.c : ''
  const subscriberId = typeof q.s === 'string' ? q.s : ''
  const token = typeof q.t === 'string' ? q.t : ''
  if (!campaignId || !subscriberId || !token) {
    throw createError({ statusCode: 400, statusMessage: 'missing_params' })
  }

  const valid = await verifyEmailToken(emailLinkSecret(), token, 'unsub', campaignId, subscriberId)
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'invalid_token' })

  const result = await getSubscriberWithLists(subscriberId)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  return {
    email: result.subscriber.email,
    name: result.subscriber.name,
    lists: result.lists
  }
})
