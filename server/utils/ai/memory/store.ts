import { queryOne as realQueryOne, queryRows as realQueryRows, execute as realExecute } from '~~/server/utils/db'
import type { UserMemory, UpsertMemoryInput } from './types'

/**
 * CRUD over ai_user_memory. The DB surface is injected (defaults to the real db utils) so the
 * logic is unit-testable without a database — mirrors the injected-deps pattern used across the
 * tool layer. Every read is user_id-scoped; cross-user access is impossible by construction.
 */
export interface MemoryDb {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  execute: (sql: string, params?: unknown[]) => Promise<unknown>
}

const defaultDb: MemoryDb = {
  queryOne: realQueryOne as MemoryDb['queryOne'],
  queryRows: realQueryRows as MemoryDb['queryRows'],
  execute: realExecute as MemoryDb['execute'],
}

/** How much salience a repeat-remember adds (capped at 1.0). */
export const REINFORCE_STEP = 0.1

/**
 * Insert a memory, or reinforce it if the same (user, type, content) already exists. Re-remembering
 * bumps salience and recency rather than creating a duplicate (the UNIQUE constraint guarantees it).
 * Returns the row id.
 */
export async function upsertMemory(input: UpsertMemoryInput, db: MemoryDb = defaultDb): Promise<string> {
  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO ai_user_memory (user_id, scope, mem_type, content, source, salience, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, mem_type, content)
       DO UPDATE SET salience = LEAST(1.0, ai_user_memory.salience + $8),
                     last_used_at = NOW(),
                     updated_at = NOW()
     RETURNING id`,
    [
      input.userId,
      input.scope ?? 'user',
      input.memType,
      input.content,
      input.source ?? 'inferred',
      input.salience ?? 0.5,
      JSON.stringify(input.metadata ?? {}),
      REINFORCE_STEP,
    ],
  )
  if (!row) throw new Error('upsertMemory: insert returned no row')
  return row.id
}

/**
 * Fetch memory rows by id (the join-back after a Vectorize search), STRICTLY scoped to the owner.
 * Isolation is enforced in the query (`AND user_id = $2`) — not left to the caller — so a foreign id
 * returned by the shared vector index can never resolve to another user's row. `$1::uuid[]` casts the
 * JS string[] to the UUID PK type (a bare `= ANY($1)` would raise `operator does not exist: uuid = text`).
 * Empty ids → no query.
 */
export async function getMemoriesByIds(ids: string[], userId: string, db: MemoryDb = defaultDb): Promise<UserMemory[]> {
  if (ids.length === 0 || !userId) return []
  return db.queryRows<UserMemory>(`SELECT * FROM ai_user_memory WHERE id = ANY($1::uuid[]) AND user_id = $2`, [ids, userId])
}

/** Stamp the Vectorize vector id onto a row after indexing (observability; the vector id IS the row id). */
export async function markEmbedded(id: string, embeddingId: string, db: MemoryDb = defaultDb): Promise<void> {
  await db.execute(`UPDATE ai_user_memory SET embedding_id = $2, updated_at = NOW() WHERE id = $1`, [id, embeddingId])
}

/** Most-recently-used memories for a user — the fallback candidate set when vector recall is empty. */
export async function listRecentMemories(userId: string, limit: number, db: MemoryDb = defaultDb): Promise<UserMemory[]> {
  return db.queryRows<UserMemory>(
    `SELECT * FROM ai_user_memory
       WHERE user_id = $1
       ORDER BY last_used_at DESC NULLS LAST, created_at DESC
       LIMIT $2`,
    [userId, limit],
  )
}

/** Stamp last_used_at = NOW() on retrieved rows (recency reinforcement). Empty ids → no-op. */
export async function stampUsed(ids: string[], db: MemoryDb = defaultDb): Promise<void> {
  if (ids.length === 0) return
  await db.execute(`UPDATE ai_user_memory SET last_used_at = NOW() WHERE id = ANY($1)`, [ids])
}

/** Right-to-forget: delete all of a user's memory (offboarding / "clear my memory"). */
export async function deleteUserMemory(userId: string, db: MemoryDb = defaultDb): Promise<void> {
  await db.execute(`DELETE FROM ai_user_memory WHERE user_id = $1`, [userId])
}
