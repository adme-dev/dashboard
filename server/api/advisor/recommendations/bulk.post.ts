/**
 * POST /api/advisor/recommendations/bulk
 *
 * Apply the same patch to many recommendations at once. Used by the
 * sticky bulk-action bar on /advisor when the user multi-selects rows.
 *
 * Body: { ids: UUID[1..200], patch: { status?, priority?, category?,
 *         assigned_to?, snoozed_until? } }
 *
 * Convention: in `patch`, key missing = unchanged; null = clear field.
 * All Zod fields use .nullable().optional() so undefined is a no-op.
 *
 * Tenant safety: the SQL update has `WHERE id = ANY($ids) AND
 * tenant_id = $tenant`, so a forged id list cannot escape the tenant.
 * Runs inside transaction() with client.query() directly (per project
 * memory: queryOne/execute cannot be used inside transaction()).
 */

import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { CATEGORIES } from '~~/server/utils/advisorCategories'

const PatchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'dismissed']).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
  category: z.enum([...CATEGORIES] as [string, ...string[]]).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  snoozed_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  patch: PatchSchema,
})

type PatchKey = keyof z.infer<typeof PatchSchema>
const FIELDS: PatchKey[] = ['status', 'priority', 'category', 'assigned_to', 'snoozed_until']

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
  const { ids, patch } = parsed.data

  // Build the SET clause from the keys that were *explicitly present*
  // in the patch (including null-to-clear). Missing keys are no-ops.
  const sets: string[] = []
  const params: any[] = []
  let idx = 1

  for (const f of FIELDS) {
    if (f in patch) {
      sets.push(`${f} = $${idx}`)
      params.push((patch as any)[f] ?? null)
      idx++
    }
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Patch contains no updatable fields' })
  }

  // acted_at side-effects mirror the per-row patch endpoint: stamp on
  // first transition to a closed status; clear when re-opening.
  const fragments: string[] = [...sets]
  if (patch.status === 'done' || patch.status === 'dismissed') {
    fragments.push(`acted_at = COALESCE(acted_at, NOW())`)
  } else if (patch.status === 'open' || patch.status === 'in_progress') {
    fragments.push(`acted_at = NULL`)
  }

  const idsParamIdx = idx
  const tenantParamIdx = idx + 1
  params.push(ids, tenantId)

  const updated = await transaction(async (client) => {
    const result = await (client as any).query(
      `UPDATE recommendations
       SET ${fragments.join(', ')}
       WHERE id = ANY($${idsParamIdx}::uuid[]) AND tenant_id = $${tenantParamIdx}
       RETURNING id`,
      params
    )

    const updatedIds: string[] = (result.rows ?? []).map((r: any) => r.id)

    // Per-row audit event so the activity log shows each rec's update.
    // Acceptable noise per the spec — the drawer collapses consecutive
    // same-actor bulk_updated rows on the client.
    if (updatedIds.length > 0) {
      const eventValues: string[] = []
      const eventParams: any[] = []
      let p = 1
      for (const id of updatedIds) {
        eventValues.push(
          `($${p++}, 'bulk_updated', $${p++}, $${p++}::jsonb)`
        )
        eventParams.push(
          id,
          user?.id ?? null,
          JSON.stringify({ fields: patch })
        )
      }
      await (client as any).query(
        `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
         VALUES ${eventValues.join(', ')}`,
        eventParams
      )
    }

    return updatedIds.length
  })

  return { updated, requested: ids.length }
})
