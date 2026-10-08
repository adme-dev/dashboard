import { createError, type H3Event } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'

/** Use operator configuration, never Host/Origin headers, for emailed credentials. */
export function pageStudioInvitedOrigin(event: H3Event): string {
  const value = event.context?.cloudflare?.env?.PAGE_STUDIO_INVITED_ORIGIN
    ?? process.env.PAGE_STUDIO_INVITED_ORIGIN
  // Existing installations without a separate Studio domain retain their entry point.
  if (value === undefined || value === '') return getAppUrl(event).replace(/\/$/, '')
  try {
    if (typeof value !== 'string') throw new Error('Invalid origin')
    const url = new URL(value)
    const local = import.meta.dev && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.origin !== value) {
      throw new Error('Invalid origin')
    }
    return url.origin
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Page Studio sign-in is temporarily unavailable.' })
  }
}
