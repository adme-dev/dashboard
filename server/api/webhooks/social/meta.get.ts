import { defineEventHandler, getQuery, createError } from 'h3'

/**
 * GET /api/webhooks/social/meta — Meta webhook subscription verification.
 * Meta calls this once with hub.mode=subscribe + hub.verify_token; echo back hub.challenge.
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return q['hub.challenge']
  }
  throw createError({ statusCode: 403, statusMessage: 'verify failed' })
})
