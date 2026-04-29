/**
 * "Why am I getting this notification?" — short LLM-generated explanation.
 *
 * Phase E1: Groq generates a one-line plain-English reason given the
 * notification's reason tag, type, title, message, and metadata.
 *
 * Falls back to a static template when Groq is unavailable.
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const STATIC_REASON_BLURBS: Record<string, string> = {
  mentioned: 'You were @mentioned in this update.',
  assigned: 'You were assigned to this task.',
  watching_item: "You're watching this specific item.",
  watching_board: "You're watching this entire board.",
  direct: "It's a direct system notification for you.",
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const notificationId = getRouterParam(event, 'id')

  if (!notificationId) {
    throw createError({ statusCode: 400, statusMessage: 'Notification ID is required' })
  }

  const row = await queryOne(
    `SELECT id, type, title, message, reason, metadata
     FROM notifications WHERE id = $1 AND user_id = $2`,
    [notificationId, user.id]
  )
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Notification not found' })
  }

  const fallback = row.reason && STATIC_REASON_BLURBS[row.reason]
    ? STATIC_REASON_BLURBS[row.reason]
    : 'A system notification was sent to you.'

  // Try Groq for a richer, context-aware explanation.
  try {
    const { generateGroqInsight, GROQ_MODELS } = await import('~~/server/utils/groqClient')
    const md = row.metadata || {}
    const ctx = [
      row.title ? `Title: ${row.title}` : null,
      row.message ? `Body: ${row.message}` : null,
      row.reason ? `Reason: ${row.reason}` : null,
      md.boardName ? `Board: ${md.boardName}` : null,
      md.taskTitle ? `Item: ${md.taskTitle}` : null,
      md.changes ? `Change: ${JSON.stringify(md.changes).slice(0, 200)}` : null,
    ].filter(Boolean).join('\n')

    const prompt = `Explain in ONE short sentence (max 18 words) why a busy user received this notification. Be specific about who/what/why. No preamble.\n\n${ctx}`

    const text = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_8B,
      maxTokens: 50,
      temperature: 0.2,
      systemPrompt: 'You write punchy single-sentence notification explanations. No preamble, no quotes, no markdown.',
    })

    const cleaned = text.trim().replace(/^["']|["']$/g, '')
    return { reason: cleaned || fallback, generatedByAI: !!cleaned }
  } catch {
    return { reason: fallback, generatedByAI: false }
  }
})
