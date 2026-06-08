import { requireAuth } from '~~/server/utils/auth'
import { textToSpeech } from '~~/server/utils/aiVoice'

/**
 * Synthesize speech for short, server-trusted strings the client wants spoken without a full
 * chat turn — primarily the result of a spoken write-confirmation in voice mode. Auth-gated;
 * no DB writes. Returns 204 (null) when the Workers AI binding is unavailable (local dev).
 */
const MAX_TEXT = 2000

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text required' })
  }
  if (text.length > MAX_TEXT) {
    throw createError({ statusCode: 400, statusMessage: 'Text too long' })
  }

  // v1 uses a single voice (design) — lang is not user-configurable.
  const result = await textToSpeech(event, text, { lang: 'en' })
  if (!result) {
    setResponseStatus(event, 204)
    return null
  }

  return {
    audioBase64: Buffer.from(result.audioBuffer).toString('base64'),
    audioFormat: result.format
  }
})
