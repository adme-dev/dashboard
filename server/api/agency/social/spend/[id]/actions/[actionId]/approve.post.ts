import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')
  const actionId = getRouterParam(event, 'actionId')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  if (!actionId) {
    throw createError({ statusCode: 400, statusMessage: 'actionId is required' })
  }

  const row = await queryOne<CampaignActionRow>(
    `UPDATE campaign_action_log
     SET action_status = 'approved',
         approved_by = $3,
         approved_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'approvedBy', $3::text,
           'approvedAt', NOW()::text
         )
     WHERE media_spend_id = $1
       AND id = $2
       AND action_status = 'planned'
     RETURNING id::text,
               media_spend_id::text,
               platform,
               action_type,
               action_status,
               requested_by::text,
               requested_at::text,
               approved_by::text,
               approved_at::text,
               executed_at::text,
               previous_value,
               new_value,
               reason`,
    [id, actionId, user.id]
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Planned action not found' })
  }

  return { approved: true, action: normalizeAction(row) }
})

interface CampaignActionRow {
  id: string
  media_spend_id: string
  platform: 'meta' | 'google_ads'
  action_type: string
  action_status: string
  requested_by: string | null
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  executed_at: string | null
  previous_value: Record<string, unknown>
  new_value: Record<string, unknown>
  reason: string | null
}

function normalizeAction(row: CampaignActionRow) {
  return {
    id: row.id,
    mediaSpendId: row.media_spend_id,
    platform: row.platform === 'google_ads' ? 'google' : 'meta',
    actionType: row.action_type,
    actionStatus: row.action_status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    executedAt: row.executed_at,
    previousValue: row.previous_value,
    newValue: row.new_value,
    reason: row.reason,
  }
}
