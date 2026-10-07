import { createError } from 'h3'
import { readStandaloneMedia } from './standaloneMedia'
import type { ContentAuthorityRequest } from './businessContent'
import { EMAIL_IMAGE_MAX_BYTES, EMAIL_IMAGES_MAX_BYTES, emailTemplateImages, type EmailTemplate } from '~~/shared/pageStudio/emailTemplates'

const unavailable = () => createError({ statusCode: 404, statusMessage: 'Image unavailable' })
function matchesRaster(bytes: Uint8Array, mime: string) {
  const at = (...values: number[]) => values.every((value, index) => bytes[index] === value)
  if (mime === 'image/png') return at(137, 80, 78, 71, 13, 10, 26, 10)
  if (mime === 'image/jpeg') return at(255, 216, 255)
  if (mime === 'image/gif') return at(71, 73, 70, 56) && [55, 57].includes(bytes[4]!) && bytes[5] === 97
  return mime === 'image/webp' && at(82, 73, 70, 70) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)
}
async function readBounded(image: Awaited<ReturnType<typeof readStandaloneMedia>>) {
  if (image.size > EMAIL_IMAGE_MAX_BYTES) {
    await image.body.cancel()
    throw unavailable()
  }
  const reader = image.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > EMAIL_IMAGE_MAX_BYTES) throw unavailable()
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (length !== image.size || !matchesRaster(bytes, image.mediaType)) throw unavailable()
  return bytes
}
/** Never fetches a user URL. Reuses scoped, scanned R2 asset admission and embeds
 * bounded raster bytes so the sandboxed iframe needs no authenticated image URL. */
export async function resolveEmailTemplateMedia(request: ContentAuthorityRequest, template: EmailTemplate, deps: { read?: typeof readStandaloneMedia } = {}) {
  return resolveScopedEmailTemplateMedia(template, async (id) => {
    if (request.actor.role !== 'client' || !request.actor.clientId) throw createError({ statusCode: 403, statusMessage: 'Website image access denied' })
    return (deps.read ?? readStandaloneMedia)({ siteId: request.siteId, clientId: request.actor.clientId, userId: request.actor.actorId, tokenHash: request.login.tokenHash }, id, { bucket: request.env.MEDIA_BUCKET as NonNullable<Parameters<typeof readStandaloneMedia>[2]>['bucket'] })
  })
}

export async function resolveScopedEmailTemplateMedia(template: EmailTemplate, readAsset: (assetId: string) => Promise<Awaited<ReturnType<typeof readStandaloneMedia>>>, recheck: () => Promise<unknown> = async () => {}) {
  const references = emailTemplateImages(template)
  const images: Record<string, string> = {}
  const warnings: string[] = []
  let total = 0
  for (const id of new Set(references.map(image => image.assetId))) {
    try {
      const image = await readAsset(id)
      const bytes = await readBounded(image)
      await recheck()
      const renderedBytes = bytes.byteLength * references.filter(item => item.assetId === id).length
      if (total + renderedBytes > EMAIL_IMAGES_MAX_BYTES) throw unavailable()
      total += renderedBytes
      images[id] = `data:${image.mediaType};base64,${Buffer.from(bytes).toString('base64')}`
    } catch (error) {
      await recheck()
      if ((error as { statusCode?: number })?.statusCode !== 404) throw error
      warnings.push('An image is unavailable or too large. Choose a current website image up to 512 KB (2 MB total).')
    }
  }
  return { images, warnings: [...new Set(warnings)] }
}
