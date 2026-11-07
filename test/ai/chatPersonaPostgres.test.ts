import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { resolveChatPersona } from '~~/server/utils/ai/chatPersona'

const url = process.env.ASSISTANT_CHAT_PG_URL
const target = url ? new URL(url) : null
const local = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/assistant_chat_test_[a-z0-9_]+$/.test(target.pathname)
describe.skipIf(!local)('personal focus persistence in disposable PostgreSQL', () => {
  it('clears only the owning conversation focus, retains other context, and persists explicit General', async () => {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      await client.query(`CREATE TEMP TABLE ai_conversations (id text PRIMARY KEY, user_id text, system_context jsonb);
        INSERT INTO ai_conversations VALUES ('own','staff','{"persona":"finance","board":"keep"}'),('other','peer','{"persona":"finance"}')`)
      const db = { queryOne: async (sql: string, args: unknown[]) => (await client.query(sql, args)).rows[0] ?? null,
        execute: async (sql: string, args: unknown[]) => (await client.query(sql, args)).rowCount }
      expect(await resolveChatPersona({ conversationId: 'own', userId: 'staff', requested: undefined, personal: 'marketing', persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)).toBe('finance')
      expect(await resolveChatPersona({ conversationId: 'own', userId: 'staff', requested: null, personal: 'marketing', persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)).toBe('marketing')
      expect((await client.query('SELECT system_context FROM ai_conversations WHERE id=\'own\'')).rows[0].system_context).toEqual({ board: 'keep' })
      await resolveChatPersona({ conversationId: 'other', userId: 'staff', requested: null, personal: 'marketing', persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)
      expect((await client.query('SELECT system_context FROM ai_conversations WHERE id=\'other\'')).rows[0].system_context).toEqual({ persona: 'finance' })
      await resolveChatPersona({ conversationId: 'own', userId: 'staff', requested: 'general', personal: 'marketing', persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)
      expect(await resolveChatPersona({ conversationId: 'own', userId: 'staff', personal: 'marketing', persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)).toBe('general')
    } finally { await client.end() }
  })
})
