import { queryOne, queryRows } from '~~/server/utils/db'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

export interface PersonaMetricsFilters {
  startDate?: string
  endDate?: string
  platform?: string
  campaignId?: string
  adGroupId?: string
  adSetId?: string
  adId?: string
  creativeId?: string
  landingPage?: string
  device?: string
  tierKey?: 'hot' | 'warm' | 'cold'
}

interface PersonaAggregateRow {
  total_personas: string
  returning_personas: string
  confirmed_leads: string
  website_matched_leads: string
  crm_linked_personas: string
  product_intent_personas: string
  attributed_leads: string
  conflict_personas: string
}

interface MixRow {
  key: string
  count: string
}

interface FeedbackRow {
  pending: string
  published: string
  failed: string
}

function count(value: string | number | null | undefined): number {
  return Number(value ?? 0)
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0
}

function normalizePlatform(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (['google', 'google_ads'].includes(normalized)) return 'google'
  if (['meta', 'meta_ads', 'facebook', 'instagram', 'fb'].includes(normalized)) return 'meta'
  return normalized
}

export async function getPersonaMetrics(clientId: string, filters: PersonaMetricsFilters = {}) {
  const generatedAt = new Date().toISOString()
  const period = {
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null
  }

  if (!await isPersonaIdentityEnabled(clientId)) {
    return {
      enabled: false,
      generatedAt,
      period,
      metrics: null,
      sourceMix: [],
      lifecycleMix: []
    }
  }

  const params = [
    clientId,
    filters.startDate ?? null,
    filters.endDate ?? null,
    normalizePlatform(filters.platform),
    filters.campaignId ?? null,
    filters.adGroupId ?? null,
    filters.adSetId ?? null,
    filters.adId ?? null,
    filters.creativeId ?? null,
    filters.landingPage ?? null,
    filters.device?.trim().toLowerCase() ?? null
  ]
  const scopedLeads = `
    SELECT DISTINCT identity_link.profile_id, lead.id, lead.source,
           lead.attribution, lead.submitted_at
      FROM crm_lead_identity_links identity_link
      JOIN leads lead
        ON lead.client_id = identity_link.client_id
       AND lead.id = identity_link.lead_id
       AND lead.deleted_at IS NULL
     WHERE identity_link.client_id = $1
       AND ($2::date IS NULL OR lead.submitted_at >= $2::date)
       AND ($3::date IS NULL OR lead.submitted_at < ($3::date + INTERVAL '1 day'))
       AND (
         $4::text IS NULL
         OR CASE
              WHEN LOWER(COALESCE(
                lead.attribution->>'platform',
                lead.attribution->>'utm_source',
                lead.attribution->>'source',
                lead.source,
                'unknown'
              )) SIMILAR TO '%(facebook|instagram|meta|fb)%' THEN 'meta'
              WHEN LOWER(COALESCE(
                lead.attribution->>'platform',
                lead.attribution->>'utm_source',
                lead.attribution->>'source',
                lead.source,
                'unknown'
              )) LIKE '%google%' THEN 'google'
              ELSE LOWER(COALESCE(
                NULLIF(lead.attribution->>'platform', ''),
                NULLIF(lead.attribution->>'utm_source', ''),
                NULLIF(lead.attribution->>'source', ''),
                NULLIF(lead.source, ''),
                'unknown'
              ))
            END = $4
       )
       AND (
         $5::text IS NULL
         OR lead.campaign_id = $5
         OR lead.attribution->>'campaignId' = $5
         OR lead.attribution->>'campaign_id' = $5
       )
       AND (
         $6::text IS NULL
         OR lead.attribution->>'adGroupId' = $6
         OR lead.attribution->>'ad_group_id' = $6
       )
       AND (
         $7::text IS NULL
         OR lead.attribution->>'adSetId' = $7
         OR lead.attribution->>'ad_set_id' = $7
       )
       AND (
         $8::text IS NULL
         OR lead.attribution->>'adId' = $8
         OR lead.attribution->>'ad_id' = $8
       )
       AND (
         $9::text IS NULL
         OR lead.attribution->>'creativeId' = $9
         OR lead.attribution->>'creative_id' = $9
       )
       AND (
         $10::text IS NULL
         OR lead.attribution->>'landingPage' = $10
         OR lead.attribution->>'landing_page' = $10
         OR EXISTS (
           SELECT 1
             FROM lead_submission_intents landing_intent
            WHERE landing_intent.client_id = lead.client_id
              AND landing_intent.matched_lead_id = lead.id
              AND landing_intent.page_url = $10
         )
       )
       AND (
         $11::text IS NULL
         OR LOWER(lead.attribution->>'device') = $11
         OR EXISTS (
           SELECT 1
             FROM lead_submission_intents device_intent
            WHERE device_intent.client_id = lead.client_id
              AND device_intent.matched_lead_id = lead.id
              AND LOWER(device_intent.attribution->>'device') = $11
         )
       )`

  const [aggregate, sourceMix, lifecycleMix, feedback] = await Promise.all([
    queryOne<PersonaAggregateRow>(
      `WITH scoped_leads AS (${scopedLeads}),
            per_persona AS (
              SELECT scoped_leads.profile_id,
                     COUNT(DISTINCT scoped_leads.id) AS lead_count,
                     COUNT(DISTINCT intent.id) AS submission_count,
                     COUNT(DISTINCT scoped_leads.id) FILTER (
                       WHERE COALESCE(scoped_leads.attribution, '{}'::jsonb)
                         ?| ARRAY[
                           'utm_source', 'utm_campaign', 'campaign_id',
                           'gclid', 'gbraid', 'wbraid', 'fbclid'
                         ]
                     ) AS attributed_lead_count,
                     COUNT(DISTINCT crm_link.person_id) > 0 AS has_crm_person,
                     COUNT(DISTINCT interest.id) > 0 AS has_product_intent,
                     BOOL_OR(evidence.evidence_type = 'identity_conflict') AS has_conflict
                FROM scoped_leads
                LEFT JOIN lead_submission_intents intent
                  ON intent.client_id = $1
                 AND intent.matched_lead_id = scoped_leads.id
                LEFT JOIN lead_crm_links crm_link
                  ON crm_link.client_id = $1
                 AND crm_link.lead_id = scoped_leads.id
                LEFT JOIN crm_lead_product_interests interest
                  ON interest.client_id = $1
                 AND interest.lead_id = scoped_leads.id
                LEFT JOIN crm_identity_evidence evidence
                  ON evidence.client_id = $1
                 AND evidence.profile_id = scoped_leads.profile_id
               GROUP BY scoped_leads.profile_id
            )
       SELECT COUNT(*)::text AS total_personas,
              COUNT(*) FILTER (
                WHERE lead_count > 1 OR submission_count > 1
              )::text AS returning_personas,
              COALESCE(SUM(lead_count), 0)::text AS confirmed_leads,
              COALESCE(SUM(LEAST(submission_count, lead_count)), 0)::text AS website_matched_leads,
              COUNT(*) FILTER (WHERE has_crm_person)::text AS crm_linked_personas,
              COUNT(*) FILTER (WHERE has_product_intent)::text AS product_intent_personas,
              COALESCE(SUM(attributed_lead_count), 0)::text AS attributed_leads,
              COUNT(*) FILTER (WHERE has_conflict)::text AS conflict_personas
         FROM per_persona`,
      params
    ),
    queryRows<MixRow>(
      `WITH scoped_leads AS (${scopedLeads}),
            normalized AS (
              SELECT CASE
                       WHEN LOWER(COALESCE(
                         attribution->>'platform',
                         attribution->>'utm_source',
                         attribution->>'source',
                         source,
                         'unknown'
                       )) SIMILAR TO '%(facebook|instagram|meta|fb)%' THEN 'meta'
                       WHEN LOWER(COALESCE(
                         attribution->>'platform',
                         attribution->>'utm_source',
                         attribution->>'source',
                         source,
                         'unknown'
                       )) LIKE '%google%' THEN 'google'
                       ELSE LOWER(COALESCE(
                         NULLIF(attribution->>'platform', ''),
                         NULLIF(attribution->>'utm_source', ''),
                         NULLIF(attribution->>'source', ''),
                         NULLIF(source, ''),
                         'unknown'
                       ))
                     END AS key
                FROM scoped_leads
            )
       SELECT key, COUNT(*)::text AS count
         FROM normalized
        GROUP BY key
        ORDER BY COUNT(*) DESC, key
        LIMIT 6`,
      params
    ),
    queryRows<MixRow>(
      `WITH scoped_leads AS (${scopedLeads})
       SELECT COALESCE(NULLIF(LOWER(person.lifecycle_stage), ''), 'unclassified') AS key,
              COUNT(DISTINCT scoped_leads.profile_id)::text AS count
         FROM scoped_leads
         JOIN lead_crm_links crm_link
           ON crm_link.client_id = $1
          AND crm_link.lead_id = scoped_leads.id
         JOIN crm_people person
           ON person.client_id = crm_link.client_id
          AND person.id = crm_link.person_id
          AND person.deleted_at IS NULL
        GROUP BY COALESCE(NULLIF(LOWER(person.lifecycle_stage), ''), 'unclassified')
        ORDER BY COUNT(DISTINCT scoped_leads.profile_id) DESC
        LIMIT 6`,
      params
    ),
    queryOne<FeedbackRow>(
      `WITH scoped_leads AS (${scopedLeads}),
            scoped_events AS (
              SELECT DISTINCT event.id, event.outbox_status
                FROM conversion_events event
               WHERE event.client_id = $1
                 AND EXISTS (
                   SELECT 1
                     FROM scoped_leads
                    WHERE (
                      event.source_entity_type = 'lead'
                      AND event.source_entity_id = scoped_leads.id::text
                    ) OR (
                      event.source_entity_type = 'crm_opportunity'
                      AND EXISTS (
                        SELECT 1
                          FROM lead_crm_links crm_link
                         WHERE crm_link.client_id = $1
                           AND crm_link.opportunity_id::text = event.source_entity_id
                           AND crm_link.lead_id = scoped_leads.id
                      )
                    )
                 )
            )
       SELECT COUNT(*) FILTER (
                WHERE outbox_status IN ('pending', 'claimed', 'paused')
              )::text AS pending,
              COUNT(*) FILTER (WHERE outbox_status = 'published')::text AS published,
              COUNT(*) FILTER (WHERE outbox_status = 'failed')::text AS failed
         FROM scoped_events`,
      params
    )
  ])

  const totalPersonas = count(aggregate?.total_personas)
  const returningPersonas = count(aggregate?.returning_personas)
  const confirmedLeads = count(aggregate?.confirmed_leads)
  const websiteMatchedLeads = count(aggregate?.website_matched_leads)
  const crmLinkedPersonas = count(aggregate?.crm_linked_personas)
  const productIntentPersonas = count(aggregate?.product_intent_personas)
  const attributedLeads = count(aggregate?.attributed_leads)
  const conflictPersonas = count(aggregate?.conflict_personas)

  return {
    enabled: true,
    generatedAt,
    period,
    metrics: {
      totalPersonas,
      returningPersonas,
      confirmedLeads,
      websiteMatchedLeads,
      crmLinkedPersonas,
      productIntentPersonas,
      attributedLeads,
      conflictPersonas,
      returningRate: percentage(returningPersonas, totalPersonas),
      websiteMatchRate: percentage(websiteMatchedLeads, confirmedLeads),
      crmMatchRate: percentage(crmLinkedPersonas, totalPersonas),
      attributionCoverage: percentage(attributedLeads, confirmedLeads)
    },
    sourceMix: sourceMix.map(item => ({ source: item.key, count: count(item.count) })),
    lifecycleMix: lifecycleMix.map(item => ({ stage: item.key, count: count(item.count) })),
    providerFeedback: {
      pending: count(feedback?.pending),
      published: count(feedback?.published),
      failed: count(feedback?.failed)
    }
  }
}
