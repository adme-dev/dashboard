/**
 * "Why am I getting this notification?" — short LLM-generated explanation.
 *
 * Phase E1: Groq generates a one-line plain-English reason given the
 * notification's reason tag, type, title, message, and metadata.
 *
 * Falls back to a static template when Groq is unavailable.
 */
import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { enforceRateLimit } from '~~/server/utils/rateLimit'

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

  // 1. Cache hit — explanation persisted on the notification's metadata
  //    after first generation. Avoids re-running Groq on every popover open.
  const cachedWhy = row.metadata?.why
  if (typeof cachedWhy === 'string' && cachedWhy.length > 0) {
    return { reason: cachedWhy, generatedByAI: row.metadata?.whyGeneratedByAI === true, cached: true }
  }

  const fallback = row.reason && STATIC_REASON_BLURBS[row.reason]
    ? STATIC_REASON_BLURBS[row.reason]
    : 'A system notification was sent to you.'

  // 2. Rate limit Groq calls per user. 30/hour is generous for normal use
  //    (one popover open every 2 minutes) but caps spam.
  await enforceRateLimit(event, {
    key: `why:${user.id}`,
    limit: 30,
    windowSeconds: 3600,
  })

  // 3. Generate via Groq.
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
    const finalReason = cleaned || fallback
    const generatedByAI = !!cleaned

    // 4. Persist on metadata so subsequent calls hit the cache branch above.
    //    Best-effort; failure here just means we'll regenerate next time.
    try {
      const newMetadata = { ...(row.metadata || {}), why: finalReason, whyGeneratedByAI: generatedByAI }
      await execute(
        `UPDATE notifications SET metadata = $1 WHERE id = $2 AND user_id = $3`,
        [JSON.stringify(newMetadata), notificationId, user.id]
      )
    } catch (err) {
      console.error('[why] cache persist failed:', err)
    }

    return { reason: finalReason, generatedByAI, cached: false }
  } catch {
    return { reason: fallback, generatedByAI: false, cached: false }
  }
})
