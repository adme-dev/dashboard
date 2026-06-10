import { queryOne } from '~~/server/utils/db'

export type CampaignActionPlatform = 'meta' | 'google'
export type CampaignActionDbPlatform = 'meta' | 'google_ads'
export type CampaignActionStatus = 'planned' | 'pending' | 'approved' | 'applied' | 'failed' | 'skipped' | 'cancelled'

export interface RecordCampaignActionInput {
  mediaSpendId: string
  platform: CampaignActionPlatform | CampaignActionDbPlatform
  actionType: string
  actionStatus?: CampaignActionStatus
  requestedBy?: string | null
  approvedBy?: string | null
  approvedAt?: string | null
  cancelledBy?: string | null
  cancelledAt?: string | null
  executedAt?: string | null
  previousValue: Record<string, unknown>
  newValue: Record<string, unknown>
  reason?: string | null
  externalRequestId?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface CampaignActionLogEntry {
  id: string
  mediaSpendId: string
  platform: CampaignActionPlatform
  actionType: string
  actionStatus: CampaignActionStatus
  requestedBy: string | null
  requestedAt: string
  approvedBy: string | null
  approvedAt: string | null
  cancelledBy: string | null
  cancelledAt: string | null
  executedAt: string | null
  previousValue: Record<string, unknown>
  newValue: Record<string, unknown>
  reason: string | null
  externalRequestId: string | null
  errorMessage: string | null
  metadata: Record<string, unknown>
}

interface CampaignActionLogRow {
  id: string
  media_spend_id: string
  platform: CampaignActionDbPlatform
  action_type: string
  action_status: CampaignActionStatus
  requested_by: string | null
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  executed_at: string | null
  previous_value: Record<string, unknown>
  new_value: Record<string, unknown>
  reason: string | null
  external_request_id: string | null
  error_message: string | null
  metadata: Record<string, unknown>
}

export async function recordCampaignAction(input: RecordCampaignActionInput): Promise<CampaignActionLogEntry> {
  const row = await queryOne<CampaignActionLogRow>(
    `INSERT INTO campaign_action_log (
       media_spend_id,
       platform,
       action_type,
       action_status,
       requested_by,
       approved_by,
       approved_at,
       cancelled_by,
       cancelled_at,
       executed_at,
       previous_value,
       new_value,
       reason,
       external_request_id,
       error_message,
       metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb)
     RETURNING id::text,
               media_spend_id::text,
               platform,
               action_type,
               action_status,
               requested_by::text,
               requested_at::text,
               approved_by::text,
               approved_at::text,
               cancelled_by::text,
               cancelled_at::text,
               executed_at::text,
               previous_value,
               new_value,
               reason,
               external_request_id,
               error_message,
               metadata`,
    [
      input.mediaSpendId,
      toDbPlatform(input.platform),
      input.actionType,
      input.actionStatus ?? 'planned',
      input.requestedBy ?? null,
      input.approvedBy ?? null,
      input.approvedAt ?? null,
      input.cancelledBy ?? null,
      input.cancelledAt ?? null,
      input.executedAt ?? null,
      input.previousValue,
      input.newValue,
      input.reason ?? null,
      input.externalRequestId ?? null,
      input.errorMessage ?? null,
      input.metadata ?? {},
    ]
  )

  if (!row) throw new Error('Failed to record campaign action')
  return fromDbRow(row)
}

function toDbPlatform(platform: CampaignActionPlatform | CampaignActionDbPlatform): CampaignActionDbPlatform {
  return platform === 'google' ? 'google_ads' : platform
}

function fromDbPlatform(platform: CampaignActionDbPlatform): CampaignActionPlatform {
  return platform === 'google_ads' ? 'google' : 'meta'
}

function fromDbRow(row: CampaignActionLogRow): CampaignActionLogEntry {
  return {
    id: row.id,
    mediaSpendId: row.media_spend_id,
    platform: fromDbPlatform(row.platform),
    actionType: row.action_type,
    actionStatus: row.action_status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    executedAt: row.executed_at,
    previousValue: row.previous_value,
    newValue: row.new_value,
    reason: row.reason,
    externalRequestId: row.external_request_id,
    errorMessage: row.error_message,
    metadata: row.metadata,
  }
}
