import type { H3Event } from 'h3'

import { execute, queryOneFresh, transaction } from '~~/server/utils/db'
import { indexMemoryVector } from './embed'

export interface MemoryIndexOutboxRow {
  id: string
  memoryId: string
  userId: string
  memType: 'semantic' | 'episodic' | 'procedural'
  content: string
  attempts: number
}

export interface MemoryIndexOutboxDependencies {
  claim: () => Promise<MemoryIndexOutboxRow | null>
  index: (row: MemoryIndexOutboxRow, event: H3Event) => Promise<unknown>
  complete: (id: string) => Promise<void>
  retry: (id: string, attempts: number, error: string) => Promise<void>
}

const defaultDependencies: MemoryIndexOutboxDependencies = {
  claim: async () => await transaction(async db => {
    const row = (await db.query<any>(
      `SELECT outbox.id, outbox.memory_id, memory.user_id, memory.mem_type, memory.content, outbox.attempts
         FROM ai_memory_index_outbox outbox
         JOIN ai_user_memory memory ON memory.id = outbox.memory_id
        WHERE (outbox.status = 'pending' AND outbox.next_attempt_at <= NOW())
           OR (outbox.status = 'processing' AND outbox.claimed_at < NOW() - INTERVAL '10 minutes')
        ORDER BY outbox.next_attempt_at, outbox.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`
    )).rows[0]
    if (!row) return null
    await db.query(
      `UPDATE ai_memory_index_outbox
          SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1, updated_at = NOW()
        WHERE id = $1`,
      [row.id]
    )
    return {
      id: row.id,
      memoryId: row.memory_id,
      userId: row.user_id,
      memType: row.mem_type,
      content: row.content,
      attempts: Number(row.attempts)
    }
  }),
  index: async (row, event) => await indexMemoryVector({
    event,
    id: row.memoryId,
    userId: row.userId,
    scope: 'user',
    memType: row.memType,
    content: row.content
  }),
  complete: async id => { await execute('DELETE FROM ai_memory_index_outbox WHERE id = $1', [id]) },
  retry: async (id, attempts, error) => {
    const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(attempts, 8))
    await queryOneFresh(
      `UPDATE ai_memory_index_outbox
          SET status = 'pending', claimed_at = NULL, last_error = $2,
              next_attempt_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [id, error.slice(0, 500), delaySeconds]
    )
  }
}

export async function processMemoryIndexOutbox(
  deps: MemoryIndexOutboxDependencies = defaultDependencies,
  options: { limit?: number, event: H3Event }
): Promise<{ claimed: number, indexed: number, retried: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100))
  let claimed = 0
  let indexed = 0
  let retried = 0
  for (let i = 0; i < limit; i++) {
    const row = await deps.claim()
    if (!row) break
    claimed++
    try {
      const result = await deps.index(row, options.event)
      if (result === false) throw new Error('Vectorize indexing unavailable')
      await deps.complete(row.id)
      indexed++
    } catch (error) {
      await deps.retry(row.id, row.attempts + 1, error instanceof Error ? error.message : 'Vectorize indexing failed')
      retried++
    }
  }
  return { claimed, indexed, retried }
}
