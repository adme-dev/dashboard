import { createError, type H3Event } from 'h3'

export function isVideoGenerationEnabled(event: H3Event): boolean {
  const env = event?.context?.cloudflare?.env ?? process.env
  return env.VIDEO_GENERATION_ENABLED === 'true'
}

export function requireVideoGenerationEnabled(event: H3Event): void {
  if (!isVideoGenerationEnabled(event)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found', data: { code: 'VIDEO_GENERATION_DISABLED' } })
  }
}
