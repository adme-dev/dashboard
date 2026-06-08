import { requireAuth } from '~~/server/utils/auth'
import { speechToText } from '~~/server/utils/aiVoice'

/**
 * Speech-to-text only — transcribe a short audio clip WITHOUT running the agent. Voice mode uses
 * this for the spoken confirm/cancel utterance: we need the words, not another agent turn (sending
 * it through the full chat pipeline would pollute history and could leak a stray proposal). Auth-
 * gated; no DB writes; returns 422 when nothing intelligible was heard.
 */
const MAX_AUDIO_SIZE = 10 * 1024 * 1024 // 10MB
const MIN_AUDIO_SIZE = 100 // bytes
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-m4a']

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'Multipart form data required' })
  }

  const audioPart = formData.find(p => p.name === 'audio')
  if (!audioPart || !audioPart.data) {
    throw createError({ statusCode: 400, statusMessage: 'Audio file required' })
  }

  const type = audioPart.type
  if (!type || !ALLOWED_AUDIO_TYPES.some(t => type.startsWith(t))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid audio format' })
  }
  if (audioPart.data.length > MAX_AUDIO_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Audio file too large (max 10MB)' })
  }
  if (audioPart.data.length < MIN_AUDIO_SIZE) {
    throw createError({ statusCode: 422, statusMessage: 'Audio too short. Try again.' })
  }

  const stt = await speechToText(event, audioPart.data)
  if (!stt || !stt.text) {
    throw createError({ statusCode: 422, statusMessage: 'Could not understand audio.' })
  }

  return { text: stt.text }
})
