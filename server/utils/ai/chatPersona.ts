import { createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { resolvePersona } from '~~/server/utils/ai/personas'

/** Undefined keeps the conversation override; null explicitly returns to My Assistant. */
export function parseChatPersona(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim()) return value
  throw createError({ statusCode: 400, statusMessage: 'Invalid assistant focus' })
}

export async function resolveChatPersona(
  input: { conversationId: string, userId: string, requested?: string | null, personal: string | null, persist: boolean },
  db: { queryOne: typeof queryOne, execute: typeof execute } = { queryOne, execute }
): Promise<string | null> {
  const { conversationId, userId, requested, personal, persist } = input
  if (requested === null) {
    if (persist) await db.execute(
      `UPDATE ai_conversations SET system_context = COALESCE(system_context, '{}'::jsonb) - 'persona'
       WHERE id = $1 AND user_id = $2 AND system_context ? 'persona'`, [conversationId, userId])
    return personal
  }
  if (requested !== undefined) {
    const key = resolvePersona(requested).key
    if (persist) await db.execute(
      `UPDATE ai_conversations
       SET system_context = COALESCE(system_context, '{}'::jsonb) || jsonb_build_object('persona', $2::text)
       WHERE id = $1 AND user_id = $3`, [conversationId, key, userId])
    return key
  }
  const row = await db.queryOne<{ system_context: { persona?: unknown } }>(
    'SELECT system_context FROM ai_conversations WHERE id = $1 AND user_id = $2', [conversationId, userId])
  const stored = row?.system_context?.persona
  return typeof stored === 'string' && stored ? resolvePersona(stored).key : personal
}
