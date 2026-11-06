import { createError, type H3Event } from 'h3'

/** Primitive bindings take precedence; a deployed missing flag fails closed. */
export function requireStoryboardEnabled(event: H3Event): void {
  const env = event.context.cloudflare?.env
  const enabled = env ? env.VIDEO_STORYBOARD_ENABLED : process.env.VIDEO_STORYBOARD_ENABLED
  if (enabled !== 'true') throw createError({ statusCode: 404, statusMessage: 'Storyboard editing is not enabled' })
}
