import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const rows = await queryRows<{
    id: string
    media_spend_id: string
    platform: string
    action_type: string
    action_status: string
    requested_by: string | null
    requested_by_name: string | null
    requested_by_avatar: string | null
    requested_at: string
    approved_by: string | null
    approved_by_name: string | null
    approved_by_avatar: string | null
    approved_at: string | null
    executed_at: string | null
    previous_value: Record<string, unknown>
    new_value: Record<string, unknown>
    reason: string | null
    external_request_id: string | null
    error_message: string | null
  }>(
    `SELECT cal.id::text,
            cal.media_spend_id::text,
            cal.platform,
            cal.action_type,
            cal.action_status,
            cal.requested_by::text,
            tm.name as requested_by_name,
            tm.avatar_url as requested_by_avatar,
            cal.requested_at::text,
            cal.approved_by::text,
            approver.name as approved_by_name,
            approver.avatar_url as approved_by_avatar,
            cal.approved_at::text,
            cal.executed_at::text,
            cal.previous_value,
            cal.new_value,
            cal.reason,
            cal.external_request_id,
            cal.error_message
     FROM campaign_action_log cal
     LEFT JOIN team_members tm ON tm.id = cal.requested_by
     LEFT JOIN team_members approver ON approver.id = cal.approved_by
     WHERE cal.media_spend_id = $1
     ORDER BY COALESCE(cal.executed_at, cal.requested_at) DESC
     LIMIT 50`,
    [id]
  )

  return rows.map(r => ({
    id: r.id,
    mediaSpendId: r.media_spend_id,
    platform: r.platform,
    actionType: r.action_type,
    actionStatus: r.action_status,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    requestedByAvatar: r.requested_by_avatar,
    requestedAt: r.requested_at,
    approvedBy: r.approved_by,
    approvedByName: r.approved_by_name,
    approvedByAvatar: r.approved_by_avatar,
    approvedAt: r.approved_at,
    executedAt: r.executed_at,
    previousValue: r.previous_value,
    newValue: r.new_value,
    reason: r.reason,
    externalRequestId: r.external_request_id,
    errorMessage: r.error_message,
  }))
})
