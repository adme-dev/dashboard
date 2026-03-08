import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { processUserMessage } from '~~/server/utils/aiChatEngine'
import { speechToText, textToSpeech } from '~~/server/utils/aiVoice'

const RATE_LIMIT_MAX_MESSAGES = 12
const MAX_AUDIO_SIZE = 10 * 1024 * 1024 // 10MB
const MIN_AUDIO_SIZE = 100 // 100 bytes
const ALLOWED_ENTITY_TYPES = new Set(['task', 'client', 'project', 'brief'])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  // Rate limit: same as text messages
  const rateCheck = await queryOne(`
    SELECT COUNT(*)::int as cnt
    FROM ai_messages m
    JOIN ai_conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1
      AND m.role = 'user'
      AND m.created_at > NOW() - INTERVAL '60 seconds'
  `, [user.id])

  if (rateCheck && rateCheck.cnt >= RATE_LIMIT_MAX_MESSAGES) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many messages. Please wait a moment before sending another.',
    })
  }

  // Verify ownership
  const conv = await queryOne(`
    SELECT id FROM ai_conversations
    WHERE id = $1 AND user_id = $2 AND is_archived = false
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  // Read multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'Multipart form data required' })
  }

  // Extract audio file
  const audioPart = formData.find(p => p.name === 'audio')
  if (!audioPart || !audioPart.data) {
    throw createError({ statusCode: 400, statusMessage: 'Audio file required' })
  }

  // Validate MIME type — reject if missing or not in allowed list
  const allowedAudioTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-m4a']
  if (!audioPart.type || !allowedAudioTypes.some(t => audioPart.type!.startsWith(t))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid audio format' })
  }

  // Validate audio size
  if (audioPart.data.length > MAX_AUDIO_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Audio file too large (max 10MB)' })
  }
  if (audioPart.data.length < MIN_AUDIO_SIZE) {
    throw createError({ statusCode: 422, statusMessage: 'Audio too short. Try speaking louder or longer.' })
  }

  // Extract optional mentioned entities from form data
  const entitiesPart = formData.find(p => p.name === 'mentionedEntities')
  let mentionedEntities: Array<{ type: string; id: string }> = []
  if (entitiesPart?.data) {
    try {
      const parsed = JSON.parse(entitiesPart.data.toString('utf-8'))
      if (Array.isArray(parsed)) {
        mentionedEntities = parsed
          .filter((e: any) => e?.type && e?.id && ALLOWED_ENTITY_TYPES.has(e.type))
          .slice(0, 10)
      }
    } catch {
      // Ignore malformed entities JSON
    }
  }

  // Step 1: Speech-to-Text
  const sttResult = await speechToText(event, audioPart.data)

  if (!sttResult || !sttResult.text) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Could not understand audio. Try again or type your message.',
    })
  }

  const transcribedText = sttResult.text
  const sttLatencyMs = sttResult.durationMs

  // Step 2: Process through existing AI pipeline (unchanged)
  let result
  try {
    result = await processUserMessage(id, user.id, user.role, transcribedText, event, mentionedEntities)
  } catch (err: any) {
    console.error('Failed to process voice message:', err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process message',
    })
  }

  // Step 3: Text-to-Speech on assistant response (soft fail)
  let audioBase64: string | null = null
  let audioFormat: string | null = null

  try {
    const ttsResult = await textToSpeech(event, result.message.content)
    if (ttsResult) {
      audioBase64 = Buffer.from(ttsResult.audioBuffer).toString('base64')
      audioFormat = ttsResult.format
    }
  } catch (err) {
    console.error('[voice] TTS failed (soft fail):', err)
    // Continue without audio — text response is still valid
  }

  return {
    message: result.message,
    contextSources: result.contextSources,
    transcribedText,
    audioBase64,
    audioFormat,
    sttLatencyMs,
  }
})
