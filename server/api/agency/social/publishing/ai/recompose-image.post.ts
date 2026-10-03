import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { queryOne } from '~~/server/utils/db'
import { readStoredObject } from '~~/server/utils/storage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { bannerAssetDeliveryUrl, createBannerAssetId, createBannerAssetStorageKey, uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { getAppUrl } from '~~/server/utils/appUrl'
import { detectBannerAssetMime } from '~~/shared/utils/bannerAssetIdentity'
import { SOCIAL_IMAGE_FORMATS } from '~~/shared/social/imageRecomposition'
import { legacySocialImageKey, recompositionPrompt, validateRecompositionSource } from '~~/server/utils/socialPublishing/imageRecomposition'
import { recomposeImageWithGateway, SOCIAL_IMAGE_MODEL } from '~~/server/utils/socialPublishing/imageGateway'
import type { CreativeAiBinding } from '~~/server/utils/creative-generation/aiGatewayProvider'
import { getAiGatewayGenerationPolicyStatus } from '~~/server/utils/aiGatewayGenerationPolicy'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

const schema = z.object({
  clientId: z.string().uuid(),
  postId: z.string().uuid(),
  sourceUrl: z.string().url().max(8192),
  format: z.enum(['portrait', 'square', 'story']),
  instruction: z.string().trim().max(500).default('')
})
let active = 0

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a saved image and a valid output format' })
  const body = parsed.data
  await requireSocialClientAccess(event, body.clientId)
  const post = await queryOne<{ client_id: string, created_by: string, status: string, media_urls: string[] | null }>(
    'SELECT client_id, created_by, status, media_urls FROM social_posts WHERE id=$1 AND client_id=$2', [body.postId, body.clientId]
  )
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found for this client' })
  validateRecompositionSource(post, body.clientId, body.sourceUrl)

  const config = useRuntimeConfig()
  const env = event.context.cloudflare?.env as Record<string, string> | undefined
  const accountId = env?.R2_ACCOUNT_ID || config.r2AccountId
  const bucket = env?.R2_BUCKET_NAME || config.r2BucketName || 'agency-files'
  const origins = [`https://${bucket}.${accountId}.r2.cloudflarestorage.com`, env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '']
  const legacyKey = origins.map(origin => legacySocialImageKey(body.sourceUrl, post.created_by, origin)).find(Boolean) ?? null
  const asset = await queryOne<{ r2_key: string, client_id: string | null, uploaded_by: string }>(
    'SELECT r2_key, client_id, uploaded_by FROM banner_assets WHERE url=$1 OR r2_key=$2 LIMIT 1', [body.sourceUrl, legacyKey]
  )
  if (asset && (asset.client_id ? asset.client_id !== body.clientId : asset.uploaded_by !== user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'This image is not available for this client' })
  }
  const sourceKey = asset?.r2_key || legacyKey
  if (!sourceKey) throw createError({ statusCode: 422, statusMessage: 'Use an image uploaded to XeroFlow before resizing' })
  if (active >= 2) throw createError({ statusCode: 429, statusMessage: 'Image editor is busy. Try again shortly.' })
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret) throw createError({ statusCode: 503, statusMessage: 'Image delivery is not configured' })
  const ai = event.context.cloudflare?.env?.AI as CreativeAiBinding | undefined
  if (!ai || !getAiGatewayGenerationPolicyStatus(env).spendLimitConfirmed) {
    throw createError({ statusCode: 503, statusMessage: 'AI image editing is not configured for this environment' })
  }
  const gatewayUrl = String(env?.AI_GATEWAY_URL || config.aiGatewayUrl || '')
  const gatewayId = gatewayUrl.split('/').filter(Boolean).at(-1)
  if (!gatewayId || !/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/[a-f0-9]{32}\/[a-z0-9-]+\/?$/.test(gatewayUrl)) {
    throw createError({ statusCode: 503, statusMessage: 'AI image gateway is not configured' })
  }
  active++
  const started = Date.now()
  let succeeded = false
  try {
    const object = await readStoredObject(sourceKey, { requestBucket: nativeUpload?.bucket })
    if (!object || object.size > 10 * 1024 * 1024) {
      throw createError({ statusCode: 422, statusMessage: 'Source image is missing or larger than 10 MB' })
    }
    const input = Buffer.from(await new Response(object.body).arrayBuffer())
    const inputMime = detectBannerAssetMime(input)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(inputMime || '')) {
      throw createError({ statusCode: 422, statusMessage: 'Choose a PNG, JPEG or WebP image' })
    }
    const format = SOCIAL_IMAGE_FORMATS[body.format]
    let result: { buffer: Buffer }
    try {
      result = await recomposeImageWithGateway(ai, {
        buffer: input, mime: inputMime!, prompt: recompositionPrompt(body.format, body.instruction),
        aspectRatio: body.format === 'portrait' ? '4:5' : body.format === 'square' ? '1:1' : '9:16',
        gatewayId, metadata: { feature: 'social_image_recomposition', clientId: body.clientId, postId: body.postId, userId: user.id }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown gateway error'
      // Do not log full output URLs, credentials or source image data.
      console.warn('[social-image-recomposition] gateway failed', {
        postId: body.postId,
        message: message.replace(/https?:\/\/\S+/g, '[url]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300)
      })
      throw createError({ statusCode: 502, statusMessage: 'The image editor could not finish. Your original is unchanged. Try again shortly.' })
    }
    const mime = detectBannerAssetMime(result.buffer)
    const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : null
    if (!extension) throw createError({ statusCode: 502, statusMessage: 'The editor returned an invalid image. Your original is unchanged.' })
    const assetId = createBannerAssetId()
    const fileName = `social-${body.format}-${assetId}.${extension}`
    const key = createBannerAssetStorageKey(fileName, user.id)
    const url = await bannerAssetDeliveryUrl(assetId, getAppUrl(event), signingSecret)
    const stored = await uploadBannerAsset(result.buffer, fileName, mime!, user.id, key,
      nativeUpload ? { bucket: nativeUpload.bucket, assetUrl: url } : undefined, url)
    await queryOne(`INSERT INTO banner_assets (id,name,mime_type,file_size,r2_key,url,tags,uploaded_by,client_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [assetId, `Social ${body.format} preview`, mime, stored.size, key, url,
      ['ai-recomposed', `source-post:${body.postId}`, `format:${body.format}`], user.id, body.clientId])
    succeeded = true
    return { assetId, url, sourceUrl: body.sourceUrl, format: body.format, width: format.width, height: format.height }
  } finally {
    active--
    await recordAiInvocation({ featureKey: 'social_image_recomposition', provider: 'cloudflare-ai-gateway', modelId: SOCIAL_IMAGE_MODEL, gatewayUsed: true,
      userId: user.id, clientId: body.clientId, status: succeeded ? 'success' : 'error', latencyMs: Date.now() - started,
      metadata: { postId: body.postId, format: body.format } })
  }
})
