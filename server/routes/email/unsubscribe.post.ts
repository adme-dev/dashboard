// POST /email/unsubscribe?c=&s=&t=
// RFC 8058 "one-click" unsubscribe target. This is the exact URL injected into
// the List-Unsubscribe header by the sender (campaignSend.unsubscribeUrl); a
// recipient's mail client POSTs here (body `List-Unsubscribe=One-Click`) with no
// cookies, so authorization is the signed `t` token over (campaign, subscriber).
//
// Lives under server/routes (NOT server/api) so the global API auth middleware
// — which only gates /api/* — leaves it public. The matching GET renders the
// human unsubscribe page (app/pages/email/unsubscribe.vue).
import { emailLinkSecret, verifyEmailToken } from '~~/server/utils/email-marketing/links'
import { globalUnsubscribe } from '~~/server/utils/email-marketing/subscriptions'

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

  await globalUnsubscribe({ subscriberId, campaignId })

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return 'You have been unsubscribed.'
})
