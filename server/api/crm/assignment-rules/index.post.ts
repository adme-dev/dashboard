// server/api/crm/assignment-rules/index.post.ts — upsert the rule for an object
// type (admin only). One active rule per (client, object_type); changing the pool
// resets the round-robin index so rotation starts fresh.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  object_type: z.enum(['person', 'opportunity']),
  strategy: z.enum(['round_robin', 'load_balanced', 'priority', 'single']),
  pool: z.array(z.string().uuid()).default([]),
  is_active: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM crm_assignment_rules WHERE client_id = $1 AND object_type = $2 ORDER BY created_at LIMIT 1`,
    [b.client_id, b.object_type],
  )
  if (existing) {
    const row = await queryOne(
      `UPDATE crm_assignment_rules
          SET strategy = $1, pool = $2::jsonb, is_active = $3, assignment_index = 0
        WHERE id = $4
        RETURNING id, object_type, strategy, pool, assignment_index, is_active`,
      [b.strategy, JSON.stringify(b.pool), b.is_active, existing.id],
    )
    return { item: row }
  }
  const row = await queryOne(
    `INSERT INTO crm_assignment_rules (client_id, object_type, strategy, pool, is_active, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, object_type, strategy, pool, assignment_index, is_active`,
    [b.client_id, b.object_type, b.strategy, JSON.stringify(b.pool), b.is_active, user.id],
  )
  return { item: row }
})
