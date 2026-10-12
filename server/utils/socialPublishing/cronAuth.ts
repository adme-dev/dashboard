import { createError, getHeader, type H3Event } from 'h3'

/** Pages secrets live in request bindings; process.env is only a local fallback. */
export function requireSocialCronAuth(event: H3Event): void {
  const bindings = event.context?.cloudflare?.env as Record<string, unknown> | undefined
  const secret = bindings && Object.prototype.hasOwnProperty.call(bindings, 'CRON_SECRET')
    ? bindings.CRON_SECRET
    : process.env.CRON_SECRET
  if (typeof secret !== 'string' || !secret || getHeader(event, 'x-cron-secret') !== secret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}
