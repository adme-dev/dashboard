import { queryOne, queryRows } from '~~/server/utils/db'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '~~/server/utils/leads/portalAnalytics'
import type { LeadCaptureMode } from '~~/server/utils/leads/acceptance'

type AggregateRow = {
  form_submits: string
  confirmed_leads: string
  provider_native_leads: string
  website_confirmed_leads: string
  crm_linked_leads: string
  campaign_attributed_leads: string
  browser_linked_leads: string
  first_touch_leads: string
  last_touch_leads: string
  unmatched_submissions: string
  promotion_failures: string
  promotion_pending: string
  contacted_leads: string
  qualified_leads: string
  won_leads: string
  lost_leads: string
  won_value: string
  avg_response_minutes: string | null
  last_submission_at: string | null
  last_confirmed_at: string | null
}

export interface LeadHealthIssue {
  code: string
  message: string
  severity: 'warning' | 'critical'
}

export interface LeadHealthSnapshot {
  formSubmits: number
  confirmedLeads: number
  providerNativeLeads: number
  websiteConfirmedLeads: number
  crmLinkedLeads: number
  campaignAttributedLeads: number
  browserLinkedLeads: number
  firstTouchLeads: number
  lastTouchLeads: number
  unmatchedSubmissions: number
  promotionFailures: number
  promotionPending: number
  contactedLeads: number
  qualifiedLeads: number
  wonLeads: number
  lostLeads: number
  wonValue: number
  avgResponseMinutes: number | null
  lastSubmissionAt: string | null
  lastConfirmedAt: string | null
  unmatched: Array<{ eventId: string, occurredAt: string, pageUrl: string | null }>
  failedPromotions: Array<{
    leadId: string
    attempts: number
    outcome: string | null
    errorClass: string | null
    updatedAt: string
  }>
  connectors?: Array<{
    id: string
    provider: string
    type: string
    status: string
    authority: string
    lastReceiptAt: string | null
    lastAttemptAt: string | null
    lastErrorClass: string | null
  }>
}

const numberValue = (value: string | number | null | undefined) => Number(value) || 0

export function deriveLeadHealthIssues(
  snapshot: LeadHealthSnapshot,
  mode: LeadCaptureMode
): LeadHealthIssue[] {
  const issues: LeadHealthIssue[] = []
  const usesInternalCrm = mode === 'lightweight_crm' || mode === 'full_crm'
  const failedConnectors = (snapshot.connectors ?? []).filter(connector => (
    connector.authority === 'canonical' && ['error', 'stale'].includes(connector.status)
  ))
  for (const connector of failedConnectors) {
    issues.push({
      code: `connector_${connector.id}_${connector.status}`,
      message: `${connector.provider} ${connector.type.replace(/_/g, ' ')} connector is ${connector.status}${connector.lastErrorClass ? ` (${connector.lastErrorClass})` : ''}.`,
      severity: connector.status === 'error' ? 'critical' : 'warning'
    })
  }
  if (snapshot.formSubmits > 0 && snapshot.confirmedLeads === 0) {
    issues.push({
      code: 'submits_without_confirmed_leads',
      message: 'Website submissions are being recorded, but no confirmed provider leads were received.',
      severity: 'critical'
    })
  }
  if (snapshot.unmatchedSubmissions > 0) {
    issues.push({
      code: 'unmatched_submissions',
      message: `${snapshot.unmatchedSubmissions} website submission(s) are still unmatched after 15 minutes.`,
      severity: 'warning'
    })
  }
  if (usesInternalCrm && snapshot.promotionFailures > 0) {
    issues.push({
      code: 'crm_promotion_failed',
      message: `${snapshot.promotionFailures} confirmed lead(s) failed CRM promotion.`,
      severity: 'critical'
    })
  }
  if (usesInternalCrm && snapshot.crmLinkedLeads < snapshot.confirmedLeads) {
    issues.push({
      code: 'crm_delivery_gap',
      message: `${snapshot.confirmedLeads - snapshot.crmLinkedLeads} confirmed lead(s) have not reached the CRM.`,
      severity: 'critical'
    })
  }
  const attributionCoverage = snapshot.confirmedLeads
    ? snapshot.campaignAttributedLeads / snapshot.confirmedLeads
    : 1
  if (snapshot.confirmedLeads >= 3 && attributionCoverage < 0.5) {
    issues.push({
      code: 'campaign_attribution_low',
      message: 'Campaign attribution is available for fewer than half of confirmed leads.',
      severity: 'warning'
    })
  }
  if (
    snapshot.websiteConfirmedLeads > 0
    && snapshot.browserLinkedLeads < snapshot.websiteConfirmedLeads
  ) {
    issues.push({
      code: 'browser_linkage_low',
      message: `${snapshot.websiteConfirmedLeads - snapshot.browserLinkedLeads} website lead(s) are missing their shared browser submission ID.`,
      severity: 'warning'
    })
  }
  return issues
}

export async function getLeadHealthSnapshot(
  clientId: string,
  fromDate: string,
  toDate: string
): Promise<LeadHealthSnapshot> {
  const aggregate = await queryOne<AggregateRow>(
    `WITH scoped_leads AS (
       SELECT l.*
         FROM leads l
        WHERE l.client_id = $1
          AND l.deleted_at IS NULL
          AND l.submitted_at >= $2::date
          AND l.submitted_at < ($3::date + INTERVAL '1 day')
          AND ${PORTAL_VISIBLE_LEADS_EXISTS}
     ),
     scoped_submits AS (
       SELECT intent.browser_event_id AS event_id,
              intent.occurred_at,
              intent.page_url,
              intent.match_status,
              intent.matched_lead_id
        FROM lead_submission_intents intent
        WHERE intent.client_id = $1
          AND intent.test_run_id IS NULL
          AND intent.occurred_at >= $2::date
          AND intent.occurred_at < ($3::date + INTERVAL '1 day')
     )
     SELECT
       (SELECT COUNT(*) FROM scoped_submits)::text AS form_submits,
       COUNT(*)::text AS confirmed_leads,
       COUNT(*) FILTER (WHERE source IN ('google', 'meta'))::text AS provider_native_leads,
       COUNT(*) FILTER (WHERE source NOT IN ('google', 'meta'))::text AS website_confirmed_leads,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM lead_crm_links link
          WHERE link.client_id = $1 AND link.lead_id = scoped_leads.id
       ))::text AS crm_linked_leads,
       COUNT(*) FILTER (WHERE COALESCE(
         campaign_id, ad_id, attribution->>'utm_source', attribution->>'utm_campaign',
         attribution->>'gclid', attribution->>'gbraid', attribution->>'wbraid',
         attribution->>'fbclid', attribution->>'msclkid', attribution->>'ttclid'
       ) IS NOT NULL)::text AS campaign_attributed_leads,
       COUNT(*) FILTER (
         WHERE source NOT IN ('google', 'meta')
           AND NULLIF(attribution->>'browserEventId', '') IS NOT NULL
       )::text AS browser_linked_leads,
       COUNT(*) FILTER (WHERE COALESCE(
         attribution->>'first_landing_page', attribution->>'first_utm_source',
         attribution->>'first_gclid', attribution->>'first_fbclid'
       ) IS NOT NULL)::text AS first_touch_leads,
       COUNT(*) FILTER (WHERE COALESCE(
         attribution->>'last_landing_page', attribution->>'last_utm_source',
         attribution->>'last_gclid', attribution->>'last_fbclid',
         attribution->>'landing_page'
       ) IS NOT NULL)::text AS last_touch_leads,
       (SELECT COUNT(*) FROM scoped_submits submit
         WHERE submit.occurred_at < NOW() - INTERVAL '15 minutes'
           AND submit.match_status IN ('pending', 'reserved')
           AND submit.matched_lead_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM scoped_leads lead
              WHERE lead.attribution->>'browserEventId' = submit.event_id
           ))::text AS unmatched_submissions,
       (SELECT COUNT(*) FROM lead_crm_promotion_state state
         JOIN scoped_leads lead ON lead.id = state.lead_id
        WHERE state.status = 'failed')::text AS promotion_failures,
       (SELECT COUNT(*) FROM lead_crm_promotion_state state
         JOIN scoped_leads lead ON lead.id = state.lead_id
        WHERE state.status IN ('pending', 'processing'))::text AS promotion_pending,
       COUNT(*) FILTER (WHERE status = 'contacted')::text AS contacted_leads,
       COUNT(*) FILTER (WHERE status = 'qualified')::text AS qualified_leads,
       COUNT(*) FILTER (WHERE status = 'won')::text AS won_leads,
       COUNT(*) FILTER (WHERE status = 'lost')::text AS lost_leads,
       COALESCE((
         SELECT SUM(opportunity.amount)
           FROM lead_crm_links link
           JOIN crm_opportunities opportunity
             ON opportunity.id = link.opportunity_id
            AND opportunity.client_id = link.client_id
            AND opportunity.deleted_at IS NULL
          WHERE link.client_id = $1
            AND opportunity.status = 'won'
            AND EXISTS (SELECT 1 FROM scoped_leads lead WHERE lead.id = link.lead_id)
       ), 0)::text AS won_value,
       (
         SELECT AVG(EXTRACT(EPOCH FROM (contact.contacted_at - lead.submitted_at)) / 60)
           FROM scoped_leads lead
           JOIN LATERAL (
             SELECT MIN(event.occurred_at) AS contacted_at
               FROM lead_status_events event
              WHERE event.client_id = $1
                AND event.lead_id = lead.id
                AND event.canonical_event_name = 'lead_contacted'
           ) contact ON contact.contacted_at IS NOT NULL
       )::text AS avg_response_minutes,
       (SELECT MAX(occurred_at) FROM scoped_submits)::text AS last_submission_at,
       MAX(submitted_at)::text AS last_confirmed_at
     FROM scoped_leads`,
    [clientId, fromDate, toDate]
  )

  const [unmatched, failedPromotions, connectors] = await Promise.all([
    queryRows<{ event_id: string, occurred_at: string, page_url: string | null }>(
      `SELECT intent.browser_event_id AS event_id,
              intent.occurred_at,
              intent.page_url
        FROM lead_submission_intents intent
        WHERE intent.client_id = $1
          AND intent.test_run_id IS NULL
          AND intent.occurred_at >= $2::date
          AND intent.occurred_at < ($3::date + INTERVAL '1 day')
          AND intent.occurred_at < NOW() - INTERVAL '15 minutes'
          AND intent.match_status IN ('pending', 'reserved')
          AND intent.matched_lead_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM leads lead
             WHERE lead.client_id = $1
               AND lead.deleted_at IS NULL
               AND lead.attribution->>'browserEventId' = intent.browser_event_id
          )
        ORDER BY intent.occurred_at DESC
        LIMIT 10`,
      [clientId, fromDate, toDate]
    ),
    queryRows<{
      lead_id: string
      attempts: number
      outcome: string | null
      last_error_class: string | null
      updated_at: string
    }>(
      `SELECT state.lead_id, state.attempts, state.outcome,
              state.last_error_class, state.updated_at
         FROM lead_crm_promotion_state state
         JOIN leads lead ON lead.id = state.lead_id
        WHERE state.client_id = $1
          AND state.status = 'failed'
          AND lead.submitted_at >= $2::date
          AND lead.submitted_at < ($3::date + INTERVAL '1 day')
        ORDER BY state.updated_at DESC
        LIMIT 10`,
      [clientId, fromDate, toDate]
    ),
    queryRows<{
      id: string
      provider: string
      type: string
      status: string
      authority: string
      last_receipt_at: string | null
      last_attempt_at: string | null
      last_error_class: string | null
    }>(
      `SELECT id, provider, type, status, authority,
              last_receipt_at, last_attempt_at, last_error_class
         FROM lead_connectors
        WHERE client_id = $1 AND status <> 'disabled'
        ORDER BY created_at`,
      [clientId]
    )
  ])

  return {
    formSubmits: numberValue(aggregate?.form_submits),
    confirmedLeads: numberValue(aggregate?.confirmed_leads),
    providerNativeLeads: numberValue(aggregate?.provider_native_leads),
    websiteConfirmedLeads: numberValue(aggregate?.website_confirmed_leads),
    crmLinkedLeads: numberValue(aggregate?.crm_linked_leads),
    campaignAttributedLeads: numberValue(aggregate?.campaign_attributed_leads),
    browserLinkedLeads: numberValue(aggregate?.browser_linked_leads),
    firstTouchLeads: numberValue(aggregate?.first_touch_leads),
    lastTouchLeads: numberValue(aggregate?.last_touch_leads),
    unmatchedSubmissions: numberValue(aggregate?.unmatched_submissions),
    promotionFailures: numberValue(aggregate?.promotion_failures),
    promotionPending: numberValue(aggregate?.promotion_pending),
    contactedLeads: numberValue(aggregate?.contacted_leads),
    qualifiedLeads: numberValue(aggregate?.qualified_leads),
    wonLeads: numberValue(aggregate?.won_leads),
    lostLeads: numberValue(aggregate?.lost_leads),
    wonValue: numberValue(aggregate?.won_value),
    avgResponseMinutes: aggregate?.avg_response_minutes == null
      ? null
      : numberValue(aggregate.avg_response_minutes),
    lastSubmissionAt: aggregate?.last_submission_at ?? null,
    lastConfirmedAt: aggregate?.last_confirmed_at ?? null,
    unmatched: unmatched.map(row => ({
      eventId: row.event_id,
      occurredAt: row.occurred_at,
      pageUrl: row.page_url
    })),
    failedPromotions: failedPromotions.map(row => ({
      leadId: row.lead_id,
      attempts: Number(row.attempts) || 0,
      outcome: row.outcome,
      errorClass: row.last_error_class,
      updatedAt: row.updated_at
    })),
    connectors: connectors.map(row => ({
      id: row.id,
      provider: row.provider,
      type: row.type,
      status: row.status,
      authority: row.authority,
      lastReceiptAt: row.last_receipt_at,
      lastAttemptAt: row.last_attempt_at,
      lastErrorClass: row.last_error_class
    }))
  }
}
