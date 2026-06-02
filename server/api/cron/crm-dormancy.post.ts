// server/api/cron/crm-dormancy.post.ts
// P4.1 F5 — auto-move 'active'-lifecycle contacts to 'dormant' after N days with
// no activity (N = crm_settings.dormancy_days per client, else the app default).
// Idempotent: the UPDATE is conditional on lifecycle_stage='active', so a contact
// only transitions once. Each transition is audited (F12) with a null actor.
//
// Auth: x-cron-secret matched against CRON_SECRET (skipped in dev).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { isDormant, resolveDormancyDays } from '~~/server/utils/crm/activation'

interface Candidate {
  client_id: string
  entity_type: 'person' | 'company'
  id: string
  last_touched_at: string | null
  dormancy_days: number | null
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const now = new Date()
  // Active contacts (people + companies) with their last-touch signal and the
  // client's configured threshold. GREATEST(updated_at, created_at, last activity)
  // ensures a brand-new active contact with no logged activity isn't instantly dormant.
  const candidates = await queryRows<Candidate>(
    `SELECT p.client_id, 'person'::text AS entity_type, p.id,
            GREATEST(p.updated_at, p.created_at, COALESCE(a.max_at, p.created_at))::text AS last_touched_at,
            s.dormancy_days
       FROM crm_people p
       LEFT JOIN crm_settings s ON s.client_id = p.client_id
       LEFT JOIN (SELECT client_id, target_id, MAX(COALESCE(scheduled_at, created_at)) AS max_at
                    FROM crm_activities WHERE target_type = 'person' AND deleted_at IS NULL
                    GROUP BY client_id, target_id) a
              ON a.client_id = p.client_id AND a.target_id = p.id
      WHERE p.deleted_at IS NULL AND p.lifecycle_stage = 'active'
     UNION ALL
     SELECT c.client_id, 'company'::text AS entity_type, c.id,
            GREATEST(c.updated_at, c.created_at, COALESCE(a.max_at, c.created_at))::text AS last_touched_at,
            s.dormancy_days
       FROM crm_companies c
       LEFT JOIN crm_settings s ON s.client_id = c.client_id
       LEFT JOIN (SELECT client_id, target_id, MAX(COALESCE(scheduled_at, created_at)) AS max_at
                    FROM crm_activities WHERE target_type = 'company' AND deleted_at IS NULL
                    GROUP BY client_id, target_id) a
              ON a.client_id = c.client_id AND a.target_id = c.id
      WHERE c.deleted_at IS NULL AND c.lifecycle_stage = 'active'
      LIMIT 2000`,
  )

  let transitioned = 0
  for (const cand of candidates) {
    const threshold = resolveDormancyDays(cand.dormancy_days)
    if (!isDormant(cand.last_touched_at, now, threshold)) continue
    const table = cand.entity_type === 'person' ? 'crm_people' : 'crm_companies'
    try {
      await execute(
        `UPDATE ${table} SET lifecycle_stage = 'dormant', updated_at = NOW()
          WHERE id = $1 AND client_id = $2 AND lifecycle_stage = 'active'`,
        [cand.id, cand.client_id],
      )
      await recordFieldChanges({
        clientId: cand.client_id,
        entityType: cand.entity_type,
        entityId: cand.id,
        before: { lifecycle_stage: 'active' },
        after: { lifecycle_stage: 'dormant' },
        fields: ['lifecycle_stage'],
        actor: null,
      })
      transitioned++
    } catch (e) {
      console.error('[crm-cron] dormancy transition failed', cand.id, e)
    }
  }

  const result = { ok: true, candidates: candidates.length, transitioned }
  console.log('[crm-cron] dormancy', result)
  return result
})
