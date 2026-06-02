// server/api/crm/settings/index.get.ts — per-client CRM governance settings.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne<{ record_visibility: string, dormancy_days: number | null }>(
    `SELECT record_visibility, dormancy_days FROM crm_settings WHERE client_id = $1`, [client_id])
  return { record_visibility: row?.record_visibility ?? 'team', dormancy_days: row?.dormancy_days ?? null }
})
