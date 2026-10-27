import { createError, getRouterParam } from 'h3'
import { readPinnedSocialMedia } from '~~/server/utils/socialPublishing/mediaAssets'

/**
 * GET /api/public/social-media/:token
 * Content-pinned delivery for reviewed social media. Providers fetch this without staff cookies; the
 * HMAC token carries the asset, owning client, reviewed ETag, size and a short expiry. Bytes are streamed
 * only while the stored object still matches the reviewed identity — a replaced object returns 412.
 */
export default defineEventHandler(async (event) => {
  const result = await readPinnedSocialMedia({ event, token: getRouterParam(event, 'token') || '' })
  if (result.status === 200) return new Response(result.body, { status: 200, headers: result.headers })
  const message = {
    403: 'Invalid media link',
    404: 'Media not found',
    412: 'Reviewed media changed',
    503: 'Media delivery is unavailable'
  }[result.status]
  throw createError({ statusCode: result.status, statusMessage: message })
})
