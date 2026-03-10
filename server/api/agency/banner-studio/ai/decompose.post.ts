import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { decomposeImageLayers } from '~~/server/utils/qwenLayerDecomposer'

// Suffix-based allowlist — prevents substring bypass (e.g. evil-pub-lic.com)
const ALLOWED_DOMAIN_SUFFIXES = [
  '.r2.dev',
  '.cloudflarestorage.com',
]

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_CONCURRENT = 3
let activeDecompositions = 0

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (activeDecompositions >= MAX_CONCURRENT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many decomposition requests in progress — try again shortly' })
  }
  const body = await readBody<{
    imageUrl: string
    numLayers?: number
    prompt?: string
    negPrompt?: string
    guidanceScale?: number
    steps?: number
  }>(event)

  if (!body?.imageUrl || typeof body.imageUrl !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'imageUrl is required' })
  }

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

  if (parsedUrl.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only HTTPS URLs are allowed' })
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  const isAllowed = ALLOWED_DOMAIN_SUFFIXES.some(s => hostname.endsWith(s))
  if (!isAllowed) {
    throw createError({ statusCode: 400, statusMessage: 'Domain not allowed for image decomposition' })
  }

  // Fetch the source image
  const imageResp = await fetch(body.imageUrl)
  if (!imageResp.ok) {
    throw createError({ statusCode: 400, statusMessage: 'Failed to fetch image' })
  }

  const contentType = imageResp.headers.get('content-type') || ''
  // Accept image/* and application/octet-stream (R2 may return this if content-type was not set)
  if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
    throw createError({ statusCode: 400, statusMessage: 'URL does not point to an image' })
  }

  const arrayBuffer = await imageResp.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Image exceeds 10MB limit' })
  }

  const imageBuffer = Buffer.from(arrayBuffer)

  // Run decomposition with concurrency guard
  activeDecompositions++
  try {
    const config = useRuntimeConfig()
    const result = await decomposeImageLayers(imageBuffer, {
      numLayers,
      prompt,
      negPrompt,
      guidanceScale: body.guidanceScale,
      steps: body.steps,
      hfToken: config.hfApiToken || undefined,
    })

    if (!result?.layers || result.layers.length === 0) {
      throw createError({ statusCode: 502, statusMessage: 'Layer decomposition failed — the AI service may be unavailable' })
    }

    // Upload each layer to R2 and insert banner_assets rows
    const layers: { name: string; url: string; r2Key: string; width: number; height: number }[] = []

    for (const layer of result.layers) {
      const fileName = `decomposed-layer-${layer.index + 1}.png`

      try {
        const { key, url, size } = await uploadBannerAsset(
          layer.pngBuffer,
          fileName,
          'image/png',
          user.id
        )

        // Insert asset row
        await queryOne(`
          INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          layer.label,
          'image/png',
          size,
          key,
          url,
          ['decomposed', 'ai-layer'],
          user.id,
        ])

        layers.push({
          name: layer.label,
          url,
          r2Key: key,
          width: 0,  // dimensions resolved client-side from the image
          height: 0,
        })
      } catch (err) {
        console.warn(`[Decompose] Failed to upload layer ${layer.index}:`, err)
      }
    }

    if (layers.length === 0) {
      throw createError({ statusCode: 502, statusMessage: 'Failed to save decomposed layers' })
    }

    return {
      layers,
      pptxUrl: result.pptxUrl || null,
      zipUrl: result.zipUrl || null,
    }
  } finally {
    activeDecompositions--
  }
})
