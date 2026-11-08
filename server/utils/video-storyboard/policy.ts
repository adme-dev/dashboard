import { createError, type H3Event } from 'h3'
import { isStoryboardFeatureEnabled } from '~~/shared/video/storyboardFeaturePolicy'

/** Deployed bindings are authoritative; local process flags never override them. */
export function requireStoryboardEnabled(event: H3Event): void {
  const env = event.context.cloudflare?.env
  const enabled = env ? env.VIDEO_STORYBOARD_ENABLED : process.env.VIDEO_STORYBOARD_ENABLED
  if (!isStoryboardFeatureEnabled(enabled)) throw createError({ statusCode: 404, statusMessage: 'Storyboard editing is not enabled' })
}
