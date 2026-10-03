import { createError } from 'h3'
import { SOCIAL_IMAGE_FORMATS, type SocialImageFormat } from '~~/shared/social/imageRecomposition'

export function validateRecompositionSource(post: { client_id: string, status: string, media_urls: string[] | null }, clientId: string, sourceUrl: string) {
  if (post.client_id !== clientId) throw createError({ statusCode: 404, statusMessage: 'Post not found for this client' })
  if (!['draft', 'approved'].includes(post.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Only draft or approved posts can be recomposed. Unschedule a queued post first.' })
  }
  if (!post.media_urls?.includes(sourceUrl)) {
    throw createError({ statusCode: 409, statusMessage: 'Save this attached image to the draft before resizing it' })
  }
}

// Legacy uploads have no asset row. Only resolve an existing attachment in our
// configured bucket, under the creator's upload namespace. Never fetch its URL.
export function legacySocialImageKey(sourceUrl: string, creatorId: string, bucketOrigin: string): string | null {
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:' || url.origin !== new URL(bucketOrigin).origin || url.username || url.password) return null
    const key = decodeURIComponent(url.pathname.slice(1))
    const prefix = `banner-assets/${creatorId}/`
    if (!key.startsWith(prefix)) return null
    const parts = key.slice(prefix.length).split('/')
    if (parts.length !== 2 || !/^[0-9a-f-]{36}$/i.test(parts[0]!) || !/^[a-zA-Z0-9_.-]+\.(png|jpe?g|webp)$/i.test(parts[1]!)) return null
    return key
  } catch { return null }
}

export function recompositionPrompt(format: SocialImageFormat, instruction: string) {
  const target = SOCIAL_IMAGE_FORMATS[format]
  return `Recompose the supplied finished advertisement for a ${target.width} by ${target.height} canvas (${target.label}). Re-layout the full design; do not stretch or crop off content. Preserve every word, logo, brand colour, vehicle detail and call to action exactly. Keep all text readable with clear margins. Extend the background and reposition existing design elements to suit this format. Do not add claims, prices, offers or new objects. Return a polished complete advertisement. ${instruction}`.trim()
}
