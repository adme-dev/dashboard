import { queryOne } from '~~/server/utils/db'
import type { LeadCaptureMode } from '~~/server/utils/leads/acceptance'

export interface MetaLeadClient {
  client_id: string
  lead_capture_mode: LeadCaptureMode
}

/**
 * Resolves Meta lead ownership independently from the OAuth token used to
 * fetch the lead. Shared agency OAuth grants can appear on many client rows,
 * so token ownership is never a safe routing signal.
 */
export async function resolveMetaLeadClient(
  pageId?: string | null,
  formId?: string | null,
): Promise<MetaLeadClient | null> {
  if (!pageId && !formId) return null

  return queryOne<MetaLeadClient>(
    `WITH page_candidate AS (
       SELECT account.client_id, client.lead_capture_mode
         FROM social_accounts account
         JOIN agency_clients client ON client.id = account.client_id
        WHERE account.platform = 'facebook'
          AND account.platform_account_id = $1
          AND account.is_active = TRUE
        LIMIT 1
     ),
     form_candidate AS (
       SELECT MIN(rule.client_id::text)::uuid AS client_id,
              MIN(client.lead_capture_mode) AS lead_capture_mode
         FROM lead_form_rules rule
         JOIN agency_clients client ON client.id = rule.client_id
        WHERE rule.source = 'meta'
          AND rule.form_id = $2
          AND rule.enabled = TRUE
       HAVING COUNT(DISTINCT rule.client_id) = 1
     ),
     candidate AS (
       SELECT client_id, lead_capture_mode, 1 AS priority FROM page_candidate
       UNION ALL
       SELECT client_id, lead_capture_mode, 2 AS priority FROM form_candidate
     )
     SELECT client_id, lead_capture_mode
       FROM candidate
      WHERE client_id IS NOT NULL
      ORDER BY candidate.priority
      LIMIT 1`,
    [pageId ?? '', formId ?? ''],
  )
}
