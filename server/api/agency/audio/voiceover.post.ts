import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { generateVoiceover } from '~~/server/utils/audio/voiceGen'
import { createVoiceAsset } from '~~/server/utils/audio/assets'

const BodySchema = z.object({
  text: z.string().min(2).max(2000),
  title: z.string().max(120).nullish(),
  clientId: z.string().uuid().nullish(),
  lang: z.string().max(8).default('en'),
  voice: z.string().max(40).nullish(),
  channels: z.array(z.enum(['radio', 'tiktok', 'meta'])).default([])
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  const generated = await generateVoiceover(event, { text: body.text, lang: body.lang })
  if (!generated) {
    throw createError({ statusCode: 503, statusMessage: 'Voice generation unavailable' })
  }

  const asset = await createVoiceAsset({
    createdBy: user.id,
    clientId: body.clientId ?? null,
    title: body.title ?? null,
    text: generated.sanitizedText,
    lang: body.lang,
    voice: body.voice ?? null,
    channels: body.channels,
    audio: generated.audioBuffer,
    format: generated.format
  })

  return { asset, violations: generated.violations }
})
