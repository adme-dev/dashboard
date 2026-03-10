import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { editImageWithAI } from '~~/server/utils/qwenImageEditor'

// Suffix-based allowlist — prevents substring bypass
const ALLOWED_DOMAIN_SUFFIXES = [
  '.r2.dev',
  '.cloudflarestorage.com',
]

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_CONCURRENT = 2
let activeEdits = 0

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (activeEdits >= MAX_CONCURRENT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many AI edit requests in progress — try again shortly' })
  }

  const body = await readBody<{
    imageUrl: string
    prompt: string
    width?: number
    height?: number
    guidanceScale?: number
    steps?: number
    seed?: number
    randomizeSeed?: boolean
  }>(event)

  if (!body?.imageUrl || typeof body.imageUrl !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'imageUrl is required' })
  }

  if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'prompt is required' })
  }

  if (body.prompt.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'prompt must be 500 characters or less' })
  }

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
    throw createError({ statusCode: 400, statusMessage: 'Domain not allowed for image editing' })
  }

  // Fetch the source image
  const imageResp = await fetch(body.imageUrl)
  if (!imageResp.ok) {
    throw createError({ statusCode: 400, statusMessage: 'Failed to fetch image' })
  }

  const contentType = imageResp.headers.get('content-type') || ''
  if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
    throw createError({ statusCode: 400, statusMessage: 'URL does not point to an image' })
  }

  const arrayBuffer = await imageResp.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Image exceeds 10MB limit' })
  }

  const imageBuffer = Buffer.from(arrayBuffer)

  // Run AI edit with concurrency guard
  activeEdits++
  try {
    const config = useRuntimeConfig()
    const result = await editImageWithAI(imageBuffer, body.prompt.trim(), {
      width: body.width,
      height: body.height,
      guidanceScale: body.guidanceScale,
      steps: body.steps,
      seed: body.seed,
      randomizeSeed: body.randomizeSeed,
      hfToken: config.hfApiToken || undefined,
    })

    if (!result) {
      throw createError({ statusCode: 502, statusMessage: 'AI image edit failed — the model may be loading (try again in 30–60s)' })
    }

    // Upload to R2
    const fileName = `ai-edited-${Date.now()}.webp`
    const { key, url, size } = await uploadBannerAsset(
      result.buffer,
      fileName,
      'image/webp',
      user.id
    )

    // Insert asset row
    await queryOne(`
      INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      'AI Edited Image',
      'image/webp',
      size,
      key,
      url,
      ['ai-edited'],
      user.id,
    ])

    return { url, r2Key: key, seed: result.seed }
  } finally {
    activeEdits--
  }
})
