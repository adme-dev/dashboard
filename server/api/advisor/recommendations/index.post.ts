/**
 * POST /api/advisor/recommendations
 *
 * Manually create a recommendation (alongside the AI-generated ones
 * produced by /api/ai/financial-advisor). Used by the "+ New" button
 * on the /advisor backlog page.
 *
 * Sets source='manual' and created_by from the authed user. Vectorize
 * embed is fire-and-forget — failure does not propagate.
 */

import { createError } from 'h3'
import { z } from 'zod'
import { query } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { CATEGORIES } from '~~/server/utils/advisorCategories'
import { embedRecommendation } from '~~/server/utils/advisorEmbedder'

const BodySchema = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
  action: z.string().trim().min(1, 'Action required').max(2000),
  category: z.enum([...CATEGORIES] as [string, ...string[]]).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  client_id: z.string().uuid().nullable().optional(),
  impact: z.string().max(500).nullable().optional(),
  target_metric: z.string().max(60).nullable().optional(),
  target_direction: z.enum(['up', 'down']).nullable().optional(),
  effort: z.enum(['xs', 's', 'm', 'l', 'xl']).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

export default eventHandler(async (event) => {
  await requireAuth(event)
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const raw = await readBody<any>(event) ?? {}
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid request body',
    })
  }
  const body = parsed.data

  // Insert + return the full row in one trip so the client can prepend
  // it to the list without an extra round-trip.
  const inserted = await query<any>(
    `INSERT INTO recommendations
        (tenant_id, client_id, title, action, impact, priority,
         target_metric, target_direction, effort, due_date, assigned_to,
         category, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', $13)
     RETURNING *`,
    [
      tenantId,
      body.client_id ?? null,
      body.title,
      body.action,
      body.impact ?? null,
      body.priority,
      body.target_metric ?? null,
      body.target_direction ?? null,
      body.effort ?? null,
      body.due_date ?? null,
      body.assigned_to ?? null,
      body.category ?? null,
      user?.id ?? null,
    ]
  )
  const recommendation = inserted?.[0]
  if (!recommendation) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create recommendation' })
  }

  // Audit event for the activity log.
  try {
    await query(
      `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
       VALUES ($1, 'created_manual', $2, $3)`,
      [recommendation.id, user?.id ?? null, JSON.stringify({ source: 'manual' })]
    )
  } catch (err: any) {
    console.warn('[advisor] failed to log create event:', err?.message ?? err)
  }

  // Best-effort Vectorize embed. Don't await — let it run after the
  // response. Errors are swallowed inside the helper.
  void embedRecommendation(event, {
    id: recommendation.id,
    tenant_id: tenantId,
    client_id: recommendation.client_id,
    title: recommendation.title,
    action: recommendation.action,
    impact: recommendation.impact,
  }).catch((err) => {
    console.warn('[advisor] embed failed for manual rec:', err?.message ?? err)
  })

  return { recommendation }
})
