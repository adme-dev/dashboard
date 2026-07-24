import { queryOne } from '~~/server/utils/db'

type PromotionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

async function safelyRecord(label: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    console.warn({
      event: 'crm_lead_promotion_state_write_failed',
      operation: label,
      errorClass: error instanceof Error ? error.name : 'unknown'
    })
  }
}

export async function markCrmPromotionQueued(clientId: string, leadId: string): Promise<void> {
  await safelyRecord('queued', () => queryOne(
    `INSERT INTO lead_crm_promotion_state (client_id, lead_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (lead_id) DO UPDATE
       SET status = CASE
             WHEN lead_crm_promotion_state.status = 'completed' THEN 'completed'
             ELSE 'pending'
           END,
           outcome = CASE
             WHEN lead_crm_promotion_state.status = 'completed' THEN lead_crm_promotion_state.outcome
             ELSE NULL
           END,
           last_error_class = CASE
             WHEN lead_crm_promotion_state.status = 'completed' THEN lead_crm_promotion_state.last_error_class
             ELSE NULL
           END,
           updated_at = NOW()
     RETURNING lead_id`,
    [clientId, leadId]
  ))
}

export async function markCrmPromotionStarted(leadId: string): Promise<void> {
  await safelyRecord('started', () => queryOne(
    `UPDATE lead_crm_promotion_state
        SET status = 'processing',
            attempts = attempts + 1,
            last_attempted_at = NOW(),
            updated_at = NOW()
      WHERE lead_id = $1
        AND status <> 'completed'
      RETURNING lead_id`,
    [leadId]
  ))
}

export async function markCrmPromotionResult(
  leadId: string,
  outcome: string
): Promise<void> {
  const status: PromotionStatus = outcome === 'promoted' || outcome === 'already_promoted'
    ? 'completed'
    : outcome === 'skipped_test'
      ? 'skipped'
      : 'failed'

  await safelyRecord('result', () => queryOne(
    `UPDATE lead_crm_promotion_state
        SET status = $2,
            outcome = $3,
            last_error_class = NULL,
            completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
            updated_at = NOW()
      WHERE lead_id = $1
      RETURNING lead_id`,
    [leadId, status, outcome]
  ))
}

export async function markCrmPromotionFailure(leadId: string, error: unknown): Promise<void> {
  const errorClass = error instanceof Error ? error.name : 'unknown'
  await safelyRecord('failure', () => queryOne(
    `UPDATE lead_crm_promotion_state
        SET status = 'failed',
            outcome = 'exception',
            last_error_class = $2,
            updated_at = NOW()
      WHERE lead_id = $1
      RETURNING lead_id`,
    [leadId, errorClass]
  ))
}

export async function markCrmPromotionSkipped(
  clientId: string,
  leadId: string,
  outcome: string
): Promise<void> {
  await safelyRecord('skipped', () => queryOne(
    `INSERT INTO lead_crm_promotion_state (client_id, lead_id, status, outcome, updated_at)
     VALUES ($1, $2, 'skipped', $3, NOW())
     ON CONFLICT (lead_id) DO UPDATE
       SET status = CASE
             WHEN lead_crm_promotion_state.status = 'completed' THEN 'completed'
             ELSE 'skipped'
           END,
           outcome = CASE
             WHEN lead_crm_promotion_state.status = 'completed' THEN lead_crm_promotion_state.outcome
             ELSE EXCLUDED.outcome
           END,
           updated_at = NOW()
     RETURNING lead_id`,
    [clientId, leadId, outcome]
  ))
}
