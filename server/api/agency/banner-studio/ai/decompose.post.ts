import { z } from 'zod'
import { deleteFile, getDevR2BucketAdapter } from '~~/server/utils/storage'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { uploadBannerAsset, verifyBannerAssetToken, isBannerAssetDeliveryKey, createBannerAssetStorageKey, createBannerAssetId, bannerAssetDeliveryUrl } from '~~/server/utils/bannerStorage'
import { decomposeImageLayers } from '~~/server/utils/qwenLayerDecomposer'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { getAppUrl } from '~~/server/utils/appUrl'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

// Suffix-based allowlist — prevents substring bypass (e.g. evil-pub-lic.com)
const ALLOWED_DOMAIN_SUFFIXES = [
  '.r2.dev',
  '.cloudflarestorage.com'
]

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_CONCURRENT = 3
let activeDecompositions = 0

interface SourceAsset {
  id: string
  r2Key: string
  uploadedBy: string
  clientId: string | null
  mimeType: string
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  if (activeDecompositions >= MAX_CONCURRENT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many decomposition requests in progress — try again shortly' })
  }
  const parsed = z.object({
    imageUrl: z.string().url().max(4096),
    numLayers: z.number().int().min(2).max(8).optional(),
    prompt: z.string().max(500).optional(),
    negPrompt: z.string().max(500).optional(),
    guidanceScale: z.number().min(1).max(10).optional(),
    steps: z.number().int().min(1).max(50).optional()
  }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid decomposition request' })
  const body = parsed.data

  const numLayers = Math.min(Math.max(body.numLayers ?? 4, 2), 8)
  const prompt = body.prompt?.trim().slice(0, 500) || ''
  const negPrompt = body.negPrompt?.trim().slice(0, 500) || ' '

  // SSRF check: only allow known domains
  let parsedUrl: URL
  try {
    parsedUrl = new URL(body.imageUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image URL' })
  }

  if (parsedUrl.username || parsedUrl.password || parsedUrl.hash) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image URL' })
  }

  const delivery = resolveBannerAssetDelivery(event)
  const signedPath = /^\/api\/public\/banner-assets\/([^/]+)$/.exec(parsedUrl.pathname)
  const isSigned = parsedUrl.origin === new URL(getAppUrl(event)).origin && !!signedPath && !parsedUrl.search
  let source: SourceAsset | null
  const columns = 'id, r2_key AS "r2Key", uploaded_by AS "uploadedBy", client_id AS "clientId", mime_type AS "mimeType"'
  if (isSigned) {
    if (!delivery.signingSecret) throw createError({ statusCode: 503, statusMessage: 'Banner asset delivery is unavailable' })
    const capability = await verifyBannerAssetToken(signedPath![1]!, delivery.signingSecret)
    if (!capability) throw createError({ statusCode: 403, statusMessage: 'Invalid banner asset link' })
    source = await queryOne<SourceAsset>(`SELECT ${columns} FROM banner_assets WHERE id = $1`, [capability.assetId])
    if (source && source.id !== capability.assetId) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  } else {
    // Legacy public storage URLs must still identify an accessible saved asset.
    if (parsedUrl.protocol !== 'https:' || !ALLOWED_DOMAIN_SUFFIXES.some(s => parsedUrl.hostname.endsWith(s))) {
      throw createError({ statusCode: 400, statusMessage: 'Domain not allowed for image decomposition' })
    }
    source = await queryOne<SourceAsset>(`SELECT ${columns} FROM banner_assets WHERE url = $1`, [body.imageUrl])
  }
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
  if (source.clientId) await requireSocialClientAccess(event, source.clientId)
  else if (source.uploadedBy !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this asset' })
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Source must be a static raster image' })
  }

  let imageResp: Response
  if (isSigned) {
    if (!isBannerAssetDeliveryKey(source.r2Key, source.uploadedBy)) {
      throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
    }
    const bucket = delivery.nativeUpload?.bucket ?? getDevR2BucketAdapter()
    if (!bucket?.get) throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
    const head = await bucket.head(source.r2Key)
    if (!head) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
    if (!Number.isSafeInteger(head.size) || head.size <= 0 || head.size > MAX_IMAGE_SIZE) {
      throw createError({ statusCode: 400, statusMessage: 'Image exceeds size limits' })
    }
    const object = await bucket.get(source.r2Key)
    if (!object?.body) throw createError({ statusCode: 404, statusMessage: 'Banner asset not found' })
    imageResp = new Response(object.body)
  } else {
    imageResp = await fetch(body.imageUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
    const contentType = imageResp.headers.get('content-type') || ''
    if (!imageResp.ok || (!contentType.startsWith('image/') && contentType !== 'application/octet-stream')) {
      throw createError({ statusCode: 400, statusMessage: 'Could not read source image' })
    }
    if (Number(imageResp.headers.get('content-length')) > MAX_IMAGE_SIZE) throw createError({ statusCode: 400, statusMessage: 'Image exceeds 10MB limit' })
  }
  const arrayBuffer = await imageResp.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Image exceeds 10MB limit' })
  }

  const imageBuffer = Buffer.from(arrayBuffer)
  // Record keys before upload; PUT may succeed even if its verification fails.
  const uploadedKeys: string[] = []

  // Run decomposition with concurrency guard
  if (activeDecompositions >= MAX_CONCURRENT) throw createError({ statusCode: 429, statusMessage: 'Too many decomposition requests in progress — try again shortly' })
  activeDecompositions++
  try {
    const config = useRuntimeConfig()
    const result = await decomposeImageLayers(imageBuffer, {
      numLayers,
      prompt,
      negPrompt,
      guidanceScale: body.guidanceScale,
      steps: body.steps,
      hfToken: config.hfApiToken || undefined
    })

    if (!result?.layers || result.layers.length === 0) {
      throw createError({ statusCode: 502, statusMessage: 'Layer decomposition failed — the AI service may be unavailable' })
    }

    // Upload each layer to R2 and insert banner_assets rows
    const layers: { name: string, url: string, r2Key: string, width: number, height: number }[] = []

    for (const layer of result.layers) {
      const fileName = `decomposed-layer-${layer.index + 1}.png`

      try {
        const assetId = createBannerAssetId()
        const plannedKey = createBannerAssetStorageKey(fileName, user.id)
        uploadedKeys.push(plannedKey)
        const signedUrl = delivery.signingSecret
          ? await bannerAssetDeliveryUrl(assetId, getAppUrl(event), delivery.signingSecret)
          : undefined
        const { key, url, size } = await uploadBannerAsset(
          layer.pngBuffer,
          fileName,
          'image/png',
          user.id,
          plannedKey,
          delivery.nativeUpload ? { bucket: delivery.nativeUpload.bucket, assetUrl: signedUrl! } : undefined,
          signedUrl
        )

        // Insert asset row
        await queryOne(`
          INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by, id, client_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [
          layer.label,
          'image/png',
          size,
          key,
          url,
          ['decomposed', 'ai-layer'],
          user.id,
          assetId,
          source.clientId
        ])

        layers.push({
          name: layer.label,
          url,
          r2Key: key,
          width: layer.width,
          height: layer.height
        })
      } catch {
        throw createError({ statusCode: 502, statusMessage: 'Could not save every image layer. No layers were imported.' })
      }
    }

    if (layers.length === 0) {
      throw createError({ statusCode: 502, statusMessage: 'Failed to save decomposed layers' })
    }

    return {
      layers,
      pptxUrl: result.pptxUrl || null,
      zipUrl: result.zipUrl || null
    }
  } catch (error) {
    // Do not expose an incomplete set as successful decomposition.
    for (const key of uploadedKeys) {
      try {
        await execute('DELETE FROM banner_assets WHERE r2_key = $1 AND uploaded_by = $2', [key, user.id])
      } catch {
        console.warn('[Decompose] Asset row cleanup failed')
      }
      try {
        await deleteFile(key, delivery.nativeUpload?.bucket)
      } catch {
        console.warn('[Decompose] Asset file cleanup failed')
      }
    }
    throw error
  } finally {
    activeDecompositions--
  }
})
