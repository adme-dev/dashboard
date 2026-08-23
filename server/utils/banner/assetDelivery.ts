/**
 * How should this request store + serve banner assets?
 * - On Cloudflare: the R2 binding + RENDER_LINK_SECRET from the worker env (native path).
 * - Local dev: S3 API + RENDER_LINK_SECRET from runtime config → identical signed links,
 *   served by /api/public/banner-assets via the dev adapter. No public bucket domain needed.
 * Throws 503 when on Cloudflare without a usable binding (misconfiguration, never silent).
 */
import { createError } from 'h3'
import type { R2BucketBinding } from '~~/server/utils/storage'

export interface BannerAssetDelivery {
  nativeUpload?: { bucket: R2BucketBinding, signingSecret: string }
  signingSecret: string | null
}

function usableSecret(value: unknown): value is string {
  return typeof value === 'string' && new TextEncoder().encode(value).byteLength >= 32
}

export function resolveBannerAssetDelivery(event: any): BannerAssetDelivery {
  const cloudflare = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare
  if (cloudflare) {
    const bucket = cloudflare.env?.MEDIA_BUCKET as R2BucketBinding | undefined
    const signingSecret = cloudflare.env?.RENDER_LINK_SECRET
    if (!bucket || typeof bucket.put !== 'function' || typeof bucket.head !== 'function' || typeof bucket.delete !== 'function' || !usableSecret(signingSecret)) {
      throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
    }
    return { nativeUpload: { bucket, signingSecret }, signingSecret }
  }
  let secret: unknown
  try {
    secret = useRuntimeConfig().renderLinkSecret
  } catch {
    secret = undefined
  }
  if (!usableSecret(secret)) secret = process.env.RENDER_LINK_SECRET
  return { signingSecret: usableSecret(secret) ? secret : null }
}
