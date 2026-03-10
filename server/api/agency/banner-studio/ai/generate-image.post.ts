import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { generateImageFromPrompt } from '~~/server/utils/qwenImageGenerator'

const MAX_CONCURRENT = 2
let activeGenerations = 0

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (activeGenerations >= MAX_CONCURRENT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many AI generation requests in progress — try again shortly' })
  }

  const body = await readBody<{
    prompt: string
    aspectRatio?: string
    guidanceScale?: number
    steps?: number
    seed?: number
    randomizeSeed?: boolean
    promptEnhance?: boolean
  }>(event)

  if (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'prompt is required' })
  }

  if (body.prompt.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'prompt must be 1000 characters or less' })
  }

  // Validate aspect ratio if provided
  const validAspects = ['1:1', '16:9', '9:16', '4:3', '3:4']
  if (body.aspectRatio && !validAspects.includes(body.aspectRatio)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid aspect ratio. Valid: ${validAspects.join(', ')}` })
  }

  activeGenerations++
  try {
    const config = useRuntimeConfig()
    const result = await generateImageFromPrompt(body.prompt.trim(), {
      aspectRatio: body.aspectRatio,
      guidanceScale: body.guidanceScale,
      steps: body.steps,
      seed: body.seed,
      randomizeSeed: body.randomizeSeed,
      promptEnhance: body.promptEnhance,
      hfToken: config.hfApiToken || undefined,
    })

    if (!result) {
      throw createError({ statusCode: 502, statusMessage: 'AI image generation failed — the model may be loading (try again in 30–60s)' })
    }

    // Upload to R2
    const fileName = `ai-generated-${Date.now()}.webp`
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
      'AI Generated Image',
      'image/webp',
      size,
      key,
      url,
      ['ai-generated'],
      user.id,
    ])

    return { url, r2Key: key, seed: result.seed }
  } finally {
    activeGenerations--
  }
})
