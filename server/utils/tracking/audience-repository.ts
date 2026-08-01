import type {
  AudienceBreakdownDimension,
  AudienceBreakdownsResponse,
  AudienceClientRow,
  AudienceKpis,
  AudienceMetric,
  AudienceOverviewResponse,
  AudienceRange,
  AudienceTimeseriesResponse,
  AudienceSiteStatus
} from '~~/app/types/audience-analytics'
import { queryRows } from '~~/server/utils/db'
import { NOISE_SQL } from '~~/server/utils/tracking/analytics-sql'
import {
  deriveAudienceOpportunities,
  deriveAudienceSiteStatus,
  periodDelta,
  safeRate,
  zeroFillAudienceSeries
} from '~~/server/utils/tracking/audience-analytics'

type ClientScope = string[] | null
type AudienceQueryOperation =
  | 'available-clients'
  | 'sites'
  | 'kpis'
  | 'opportunities'
  | 'clients'
  | 'timeseries'
  | 'breakdown'

interface AudienceOverviewInput {
  range: AudienceRange
  clientIds: ClientScope
  accessibleClientIds: ClientScope
}

interface SiteRow {
  id: string
  client_id: string
  client_name: string
  name: string
  origin: string | null
  is_active: boolean
  last_event_at: string | null
  events_in_window: string | number
}

interface KpiRow {
  period: 'current' | 'previous'
  visitors: string | number
  sessions: string | number
  page_views: string | number
  engaged_sessions: string | number
  repeat_visitors: string | number
  lead_actions: string | number
  confirmed_leads: string | number
  attributed_leads: string | number
}

interface OpportunityRow {
  sessions: string | number
  high_intent_non_converters: string | number
  repeat_non_converters: string | number
  multi_interest_visitors: string | number
  paid_sessions: string | number
  paid_engagement_rate: string | number
  baseline_engagement_rate: string | number
  organic_sessions: string | number
  organic_engagement_rate: string | number
  organic_baseline_engagement_rate: string | number
  strong_organic_pages: string | number
  lead_actions: string | number
  previous_lead_actions: string | number
  confirmed_leads: string | number
  previous_confirmed_leads: string | number
  divergent_clients: string | number
}

interface ClientRow {
  client_id: string
  client_name: string
  site_count: string | number
  active_site_count: string | number
  inactive_site_count?: string | number
  receiving_sites?: string | number
  stale_sites?: string | number
  no_recent_data_sites?: string | number
  never_received_sites?: string | number
  last_event_at: string | null
  visitors: string | number
  previous_visitors: string | number
  sessions: string | number
  engaged_sessions: string | number
  lead_actions: string | number
  confirmed_leads: string | number
  attributed_leads: string | number
}

interface TimeseriesRow {
  period: 'current' | 'previous'
  day: string
  visitors: string | number
  sessions: string | number
  engaged_sessions: string | number
  lead_actions: string | number
  confirmed_leads: string | number
}

interface BreakdownRow {
  key: string
  visitors: string | number
  sessions: string | number
  engaged_sessions: string | number
  lead_actions: string | number
  confirmed_leads: string | number
}

const ZERO_KPIS: AudienceKpis = {
  visitors: 0,
  sessions: 0,
  pageViews: 0,
  engagedSessions: 0,
  engagementRate: 0,
  repeatVisitors: 0,
  leadActions: 0,
  confirmedLeads: 0,
  visitorToLeadRate: 0,
  attributionCoverage: 0
}

const QUALIFYING_EVENTS_SQL = NOISE_SQL

const CURRENT_WINDOW_SQL = `
  e.received_at >= ($2::date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
  AND e.received_at < (($3::date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
`

function numberValue(value: string | number | null | undefined): number {
  return Number(value) || 0
}

export async function withAudienceQueryTiming<T>(
  operation: AudienceQueryOperation | 'overview',
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now()
  try {
    return await run()
  } finally {
    const durationMs = Date.now() - startedAt
    if (durationMs > 1_500) {
      console.warn('[audiences] slow query', { operation, durationMs })
    }
  }
}

function mapKpis(row: KpiRow | undefined): AudienceKpis {
  if (!row) return { ...ZERO_KPIS }
  const visitors = numberValue(row.visitors)
  const sessions = numberValue(row.sessions)
  const engagedSessions = numberValue(row.engaged_sessions)
  const confirmedLeads = numberValue(row.confirmed_leads)
  const attributedLeads = numberValue(row.attributed_leads)
  return {
    visitors,
    sessions,
    pageViews: numberValue(row.page_views),
    engagedSessions,
    engagementRate: safeRate(engagedSessions, sessions),
    repeatVisitors: numberValue(row.repeat_visitors),
    leadActions: numberValue(row.lead_actions),
    confirmedLeads,
    visitorToLeadRate: safeRate(confirmedLeads, visitors),
    attributionCoverage: safeRate(attributedLeads, confirmedLeads)
  }
}

function clientStatus(row: ClientRow): AudienceSiteStatus {
  if (numberValue(row.inactive_site_count) > 0) return 'inactive'
  if (numberValue(row.never_received_sites) > 0) return 'never_received'
  if (numberValue(row.no_recent_data_sites) > 0) return 'no_recent_data'
  if (numberValue(row.stale_sites) > 0) return 'stale'
  if (numberValue(row.receiving_sites) > 0) return 'receiving'
  if (numberValue(row.active_site_count) === 0) return 'inactive'
  return deriveAudienceSiteStatus(true, row.last_event_at)
}

function emptyOverview(range: AudienceRange): AudienceOverviewResponse {
  return {
    generatedAt: new Date().toISOString(),
    window: range,
    coverage: {
      total: 0,
      receiving: 0,
      stale: 0,
      noRecentData: 0,
      neverReceived: 0,
      inactive: 0,
      sites: []
    },
    kpis: { ...ZERO_KPIS },
    previousKpis: { ...ZERO_KPIS },
    opportunities: [],
    clients: [],
    availableClients: []
  }
}

async function loadAvailableClients(clientIds: ClientScope) {
  return withAudienceQueryTiming('available-clients', () => queryRows<{ id: string, name: string }>(
    `/* audience:available-clients */
     SELECT c.id, c.name
       FROM agency_clients c
      WHERE ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
        AND c.is_active = TRUE
      ORDER BY c.name`,
    [clientIds]
  ))
}

async function loadSites(clientIds: ClientScope, range: AudienceRange) {
  return withAudienceQueryTiming('sites', () => queryRows<SiteRow>(
    `/* audience:sites */
     SELECT s.id,
            s.client_id,
            c.name AS client_name,
            s.name,
            NULLIF(s.allowed_origins[1], '') AS origin,
            s.is_active,
            latest.last_event_at,
            COALESCE(window_events.events_in_window, 0)::text AS events_in_window
       FROM tracking_sites s
       JOIN agency_clients c ON c.id = s.client_id
       LEFT JOIN LATERAL (
         SELECT e.received_at AS last_event_at
           FROM tracking_events e
          WHERE e.site_id = s.id
            AND ${QUALIFYING_EVENTS_SQL}
          ORDER BY e.received_at DESC
          LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS events_in_window
           FROM tracking_events e
          WHERE e.site_id = s.id
            AND ${CURRENT_WINDOW_SQL}
            AND ${QUALIFYING_EVENTS_SQL}
       ) window_events ON TRUE
      WHERE ($1::uuid[] IS NULL OR s.client_id = ANY($1::uuid[]))
      ORDER BY c.name, s.name`,
    [clientIds, range.fromDate, range.toDate]
  ))
}

async function loadKpis(clientIds: ClientScope, range: AudienceRange) {
  return withAudienceQueryTiming('kpis', () => queryRows<KpiRow>(
    `/* audience:kpis */
     WITH periods(period, from_date, to_date) AS (
       VALUES
         ('current'::text, $2::date, $3::date),
         ('previous'::text, $4::date, $5::date)
     ),
     scoped AS (
       SELECT p.period, e.client_id, e.event_id, e.anon_id, e.session_id, e.event_name
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         JOIN tracking_events e ON e.client_id = c.id
        WHERE e.received_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND e.received_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND ${QUALIFYING_EVENTS_SQL}
     ),
     event_metrics AS (
       SELECT period,
              COUNT(DISTINCT anon_id) AS visitors,
              COUNT(DISTINCT session_id) AS sessions,
              COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views,
              COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'engagement') AS engaged_sessions,
              COUNT(DISTINCT session_id) FILTER (
                WHERE event_name IN ('form_submit', 'phone_click', 'generate_lead', 'test_drive_booking')
              ) AS lead_actions
         FROM scoped
        GROUP BY period
     ),
     repeat_metrics AS (
       SELECT period, COUNT(*) AS repeat_visitors
         FROM (
           SELECT period, anon_id
             FROM scoped
            GROUP BY period, anon_id
           HAVING COUNT(DISTINCT session_id) > 1
         ) repeat_visitors
        GROUP BY period
     ),
     outcome_metrics AS (
       SELECT p.period,
              COUNT(DISTINCT intent.matched_lead_id)
                FILTER (WHERE intent.matched_lead_id IS NOT NULL) AS confirmed_leads,
              COUNT(DISTINCT lead.id) FILTER (WHERE lead.id IS NOT NULL AND COALESCE(
                lead.campaign_id,
                lead.ad_id,
                lead.attribution->>'utm_source',
                lead.attribution->>'utm_campaign',
                lead.attribution->>'gclid',
                lead.attribution->>'gbraid',
                lead.attribution->>'wbraid',
                lead.attribution->>'fbclid',
                lead.attribution->>'msclkid',
                lead.attribution->>'ttclid'
              ) IS NOT NULL) AS attributed_leads
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         LEFT JOIN lead_submission_intents intent
           ON intent.client_id = c.id
          AND intent.occurred_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND intent.occurred_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
         LEFT JOIN leads lead
           ON lead.id = intent.matched_lead_id
          AND lead.client_id = c.id
          AND lead.deleted_at IS NULL
        GROUP BY p.period
     )
     SELECT p.period,
            COALESCE(events.visitors, 0)::text AS visitors,
            COALESCE(events.sessions, 0)::text AS sessions,
            COALESCE(events.page_views, 0)::text AS page_views,
            COALESCE(events.engaged_sessions, 0)::text AS engaged_sessions,
            COALESCE(repeats.repeat_visitors, 0)::text AS repeat_visitors,
            COALESCE(events.lead_actions, 0)::text AS lead_actions,
            COALESCE(outcomes.confirmed_leads, 0)::text AS confirmed_leads,
            COALESCE(outcomes.attributed_leads, 0)::text AS attributed_leads
       FROM periods p
       LEFT JOIN event_metrics events ON events.period = p.period
       LEFT JOIN repeat_metrics repeats ON repeats.period = p.period
       LEFT JOIN outcome_metrics outcomes ON outcomes.period = p.period
      ORDER BY p.period`,
    [
      clientIds,
      range.fromDate,
      range.toDate,
      range.previousFromDate,
      range.previousToDate
    ]
  ))
}

async function loadOpportunityInputs(clientIds: ClientScope, range: AudienceRange) {
  return withAudienceQueryTiming('opportunities', () => queryRows<OpportunityRow>(
    `/* audience:opportunities */
     WITH periods(period, from_date, to_date) AS (
       VALUES
         ('current'::text, $2::date, $3::date),
         ('previous'::text, $4::date, $5::date)
     ),
     scoped AS (
       SELECT p.period,
              e.client_id,
              e.anon_id,
              e.session_id,
              e.event_name,
              e.page_url,
              e.utm_source,
              e.utm_medium,
              e.referrer,
              e.gclid,
              e.gbraid,
              e.wbraid,
              e.fbclid,
              e.msclkid,
              e.ttclid,
              e.event_data,
              CASE
                WHEN e.event_data->>'duration' ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (e.event_data->>'duration')::numeric
              END AS engagement_seconds,
              CASE
                WHEN e.event_data->>'depth' ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (e.event_data->>'depth')::numeric
              END AS scroll_depth,
              COALESCE(
                NULLIF(e.event_data->>'vehicle_model', ''),
                NULLIF(e.event_data->>'vehicle_name', ''),
                NULLIF(e.event_data->>'model', ''),
                NULLIF(e.page_url, '')
              ) AS interest_reference,
              (e.gclid IS NOT NULL OR e.gbraid IS NOT NULL OR e.wbraid IS NOT NULL
                OR e.fbclid IS NOT NULL OR e.msclkid IS NOT NULL OR e.ttclid IS NOT NULL
                OR e.utm_medium ~* '(cpc|ppc|paid|display)') AS is_paid,
              (e.gclid IS NULL AND e.gbraid IS NULL AND e.wbraid IS NULL
                AND e.fbclid IS NULL AND e.msclkid IS NULL AND e.ttclid IS NULL
                AND (NULLIF(e.utm_source, '') IS NOT NULL OR NULLIF(e.referrer, '') IS NOT NULL)) AS is_organic
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         JOIN tracking_events e ON e.client_id = c.id
        WHERE e.received_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND e.received_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND ${QUALIFYING_EVENTS_SQL}
     ),
     session_rollup AS (
       SELECT period,
              client_id,
              anon_id,
              session_id,
              BOOL_OR(event_name = 'engagement') AS engaged,
              MAX(engagement_seconds) AS engagement_seconds,
              BOOL_OR(event_name = 'scroll' AND scroll_depth >= 75) AS deep_scroll,
              COUNT(DISTINCT interest_reference) FILTER (
                WHERE event_name IN ('vehicle_view', 'vehicle_list_view', 'return_to_vehicle')
              ) AS interest_count,
              BOOL_OR(event_name IN ('form_submit', 'phone_click', 'generate_lead', 'test_drive_booking')) AS has_lead_action,
              BOOL_OR(is_paid) AS paid,
              BOOL_OR(is_organic) AS organic,
              MIN(page_url) FILTER (WHERE event_name = 'page_view') AS landing_page
         FROM scoped
        WHERE session_id IS NOT NULL
        GROUP BY period, client_id, anon_id, session_id
     ),
     visitor_rollup AS (
       SELECT anon_id,
              COUNT(DISTINCT session_id) AS sessions,
              BOOL_OR(has_lead_action) AS has_lead_action,
              MAX(interest_count) AS interest_count
         FROM session_rollup
        WHERE period = 'current'
        GROUP BY anon_id
     ),
     period_actions AS (
       SELECT period,
              COUNT(DISTINCT session_id) FILTER (WHERE has_lead_action) AS lead_actions
         FROM session_rollup
        GROUP BY period
     ),
     organic_pages AS (
       SELECT landing_page,
              COUNT(*) AS sessions,
              100.0 * COUNT(*) FILTER (WHERE engaged) / NULLIF(COUNT(*), 0) AS engagement_rate
         FROM session_rollup
        WHERE period = 'current' AND organic AND landing_page IS NOT NULL
        GROUP BY landing_page
     ),
     outcome_period AS (
       SELECT p.period,
              COUNT(DISTINCT intent.matched_lead_id)
                FILTER (WHERE intent.matched_lead_id IS NOT NULL) AS confirmed_leads
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         LEFT JOIN lead_submission_intents intent
           ON intent.client_id = c.id
          AND intent.occurred_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND intent.occurred_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
        GROUP BY p.period
     ),
     client_actions AS (
       SELECT client_id,
              COUNT(DISTINCT session_id) FILTER (WHERE period = 'current' AND has_lead_action) AS current_actions,
              COUNT(DISTINCT session_id) FILTER (WHERE period = 'previous' AND has_lead_action) AS previous_actions
         FROM session_rollup
        GROUP BY client_id
     ),
     client_outcomes AS (
       SELECT c.id AS client_id,
              COUNT(DISTINCT intent.matched_lead_id) FILTER (
                WHERE intent.occurred_at >= ($2::date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
                  AND intent.occurred_at < (($3::date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
              ) AS current_confirmed,
              COUNT(DISTINCT intent.matched_lead_id) FILTER (
                WHERE intent.occurred_at >= ($4::date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
                  AND intent.occurred_at < (($5::date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
              ) AS previous_confirmed
         FROM agency_clients c
         LEFT JOIN lead_submission_intents intent ON intent.client_id = c.id
        WHERE ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
        GROUP BY c.id
     ),
     aggregates AS (
       SELECT COUNT(*) AS sessions,
              COUNT(*) FILTER (
                WHERE NOT has_lead_action
                  AND (engagement_seconds >= 45 OR deep_scroll OR interest_count >= 2)
              ) AS high_intent_non_converters,
              COUNT(*) FILTER (WHERE paid) AS paid_sessions,
              100.0 * COUNT(*) FILTER (WHERE paid AND engaged)
                / NULLIF(COUNT(*) FILTER (WHERE paid), 0) AS paid_engagement_rate,
              100.0 * COUNT(*) FILTER (WHERE engaged) / NULLIF(COUNT(*), 0) AS baseline_engagement_rate,
              COUNT(*) FILTER (WHERE organic) AS organic_sessions,
              100.0 * COUNT(*) FILTER (WHERE organic AND engaged)
                / NULLIF(COUNT(*) FILTER (WHERE organic), 0) AS organic_engagement_rate
         FROM session_rollup
        WHERE period = 'current'
     )
     SELECT aggregates.sessions::text,
            aggregates.high_intent_non_converters::text,
            (SELECT COUNT(*) FROM visitor_rollup WHERE sessions > 1 AND NOT has_lead_action)::text AS repeat_non_converters,
            (SELECT COUNT(*) FROM visitor_rollup WHERE interest_count >= 2)::text AS multi_interest_visitors,
            aggregates.paid_sessions::text,
            COALESCE(aggregates.paid_engagement_rate, 0)::text AS paid_engagement_rate,
            COALESCE(aggregates.baseline_engagement_rate, 0)::text AS baseline_engagement_rate,
            aggregates.organic_sessions::text,
            COALESCE(aggregates.organic_engagement_rate, 0)::text AS organic_engagement_rate,
            COALESCE(aggregates.baseline_engagement_rate, 0)::text AS organic_baseline_engagement_rate,
            (SELECT COUNT(*) FROM organic_pages
              WHERE sessions >= 20
                AND engagement_rate >= COALESCE(aggregates.baseline_engagement_rate, 0) + 10)::text AS strong_organic_pages,
            COALESCE((SELECT lead_actions FROM period_actions WHERE period = 'current'), 0)::text AS lead_actions,
            COALESCE((SELECT lead_actions FROM period_actions WHERE period = 'previous'), 0)::text AS previous_lead_actions,
            COALESCE((SELECT confirmed_leads FROM outcome_period WHERE period = 'current'), 0)::text AS confirmed_leads,
            COALESCE((SELECT confirmed_leads FROM outcome_period WHERE period = 'previous'), 0)::text AS previous_confirmed_leads,
            (SELECT COUNT(*)
               FROM client_actions actions
               JOIN client_outcomes outcomes USING (client_id)
              WHERE actions.current_actions > actions.previous_actions
                AND outcomes.current_confirmed < outcomes.previous_confirmed)::text AS divergent_clients
       FROM aggregates`,
    [
      clientIds,
      range.fromDate,
      range.toDate,
      range.previousFromDate,
      range.previousToDate
    ]
  ))
}

async function loadClientRows(clientIds: ClientScope, range: AudienceRange) {
  return withAudienceQueryTiming('clients', () => queryRows<ClientRow>(
    `/* audience:clients */
     WITH selected_clients AS (
       SELECT c.id, c.name, COALESCE(c.reporting_timezone, 'Australia/Brisbane') AS timezone
         FROM agency_clients c
        WHERE ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
     ),
     site_latest AS (
       SELECT s.id,
              s.client_id,
              s.is_active,
              latest.last_event_at
         FROM tracking_sites s
         JOIN selected_clients c ON c.id = s.client_id
         LEFT JOIN LATERAL (
           SELECT e.received_at AS last_event_at
             FROM tracking_events e
            WHERE e.site_id = s.id AND ${QUALIFYING_EVENTS_SQL}
            ORDER BY e.received_at DESC
            LIMIT 1
         ) latest ON TRUE
     ),
     site_metrics AS (
       SELECT client_id,
              COUNT(*) AS site_count,
              COUNT(*) FILTER (WHERE is_active) AS active_site_count,
              COUNT(*) FILTER (WHERE NOT is_active) AS inactive_site_count,
              COUNT(*) FILTER (WHERE is_active AND last_event_at >= NOW() - INTERVAL '24 hours') AS receiving_sites,
              COUNT(*) FILTER (WHERE is_active AND last_event_at < NOW() - INTERVAL '24 hours'
                AND last_event_at >= NOW() - INTERVAL '7 days') AS stale_sites,
              COUNT(*) FILTER (WHERE is_active AND last_event_at < NOW() - INTERVAL '7 days') AS no_recent_data_sites,
              COUNT(*) FILTER (WHERE is_active AND last_event_at IS NULL) AS never_received_sites,
              MAX(last_event_at) AS last_event_at
         FROM site_latest
        GROUP BY client_id
     ),
     event_metrics AS (
       SELECT e.client_id,
              COUNT(DISTINCT e.anon_id) AS visitors,
              COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'engagement') AS engaged_sessions,
              COUNT(DISTINCT e.session_id) FILTER (
                WHERE e.event_name IN ('form_submit', 'phone_click', 'generate_lead', 'test_drive_booking')
              ) AS lead_actions
         FROM tracking_events e
         JOIN selected_clients c ON c.id = e.client_id
        WHERE e.received_at >= ($2::date AT TIME ZONE c.timezone)
          AND e.received_at < (($3::date + INTERVAL '1 day') AT TIME ZONE c.timezone)
          AND ${QUALIFYING_EVENTS_SQL}
        GROUP BY e.client_id
     ),
     previous_metrics AS (
       SELECT e.client_id, COUNT(DISTINCT e.anon_id) AS previous_visitors
         FROM tracking_events e
         JOIN selected_clients c ON c.id = e.client_id
        WHERE e.received_at >= ($4::date AT TIME ZONE c.timezone)
          AND e.received_at < (($5::date + INTERVAL '1 day') AT TIME ZONE c.timezone)
          AND ${QUALIFYING_EVENTS_SQL}
        GROUP BY e.client_id
     ),
     outcome_metrics AS (
       SELECT c.id AS client_id,
              COUNT(DISTINCT intent.matched_lead_id)
                FILTER (WHERE intent.matched_lead_id IS NOT NULL) AS confirmed_leads,
              COUNT(DISTINCT lead.id) FILTER (WHERE lead.id IS NOT NULL AND COALESCE(
                lead.campaign_id,
                lead.ad_id,
                lead.attribution->>'utm_source',
                lead.attribution->>'utm_campaign',
                lead.attribution->>'gclid',
                lead.attribution->>'fbclid'
              ) IS NOT NULL) AS attributed_leads
         FROM selected_clients c
         LEFT JOIN lead_submission_intents intent
           ON intent.client_id = c.id
          AND intent.occurred_at >= ($2::date AT TIME ZONE c.timezone)
          AND intent.occurred_at < (($3::date + INTERVAL '1 day') AT TIME ZONE c.timezone)
         LEFT JOIN leads lead
           ON lead.id = intent.matched_lead_id
          AND lead.client_id = c.id
          AND lead.deleted_at IS NULL
        GROUP BY c.id
     )
     SELECT c.id AS client_id,
            c.name AS client_name,
            COALESCE(sites.site_count, 0)::text AS site_count,
            COALESCE(sites.active_site_count, 0)::text AS active_site_count,
            COALESCE(sites.inactive_site_count, 0)::text AS inactive_site_count,
            COALESCE(sites.receiving_sites, 0)::text AS receiving_sites,
            COALESCE(sites.stale_sites, 0)::text AS stale_sites,
            COALESCE(sites.no_recent_data_sites, 0)::text AS no_recent_data_sites,
            COALESCE(sites.never_received_sites, 0)::text AS never_received_sites,
            sites.last_event_at,
            COALESCE(events.visitors, 0)::text AS visitors,
            COALESCE(previous.previous_visitors, 0)::text AS previous_visitors,
            COALESCE(events.sessions, 0)::text AS sessions,
            COALESCE(events.engaged_sessions, 0)::text AS engaged_sessions,
            COALESCE(events.lead_actions, 0)::text AS lead_actions,
            COALESCE(outcomes.confirmed_leads, 0)::text AS confirmed_leads,
            COALESCE(outcomes.attributed_leads, 0)::text AS attributed_leads
       FROM selected_clients c
       JOIN site_metrics sites ON sites.client_id = c.id
       LEFT JOIN event_metrics events ON events.client_id = c.id
       LEFT JOIN previous_metrics previous ON previous.client_id = c.id
       LEFT JOIN outcome_metrics outcomes ON outcomes.client_id = c.id
      ORDER BY c.name`,
    [
      clientIds,
      range.fromDate,
      range.toDate,
      range.previousFromDate,
      range.previousToDate
    ]
  ))
}

export async function getAudienceOverview(input: AudienceOverviewInput): Promise<AudienceOverviewResponse> {
  if (Array.isArray(input.clientIds) && input.clientIds.length === 0) {
    return emptyOverview(input.range)
  }

  const [availableClients, siteRows, kpiRows, opportunityRows, clientRows] = await Promise.all([
    loadAvailableClients(input.accessibleClientIds),
    loadSites(input.clientIds, input.range),
    loadKpis(input.clientIds, input.range),
    loadOpportunityInputs(input.clientIds, input.range),
    loadClientRows(input.clientIds, input.range)
  ])

  const sites = siteRows.map(row => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    name: row.name,
    origin: row.origin,
    isActive: row.is_active,
    status: deriveAudienceSiteStatus(row.is_active, row.last_event_at),
    lastEventAt: row.last_event_at,
    eventsInWindow: numberValue(row.events_in_window)
  }))

  const currentKpis = mapKpis(kpiRows.find(row => row.period === 'current'))
  const previousKpis = mapKpis(kpiRows.find(row => row.period === 'previous'))
  const opportunity = opportunityRows[0]
  const opportunities = opportunity
    ? deriveAudienceOpportunities({
        sessions: numberValue(opportunity.sessions),
        highIntentNonConverters: numberValue(opportunity.high_intent_non_converters),
        repeatNonConverters: numberValue(opportunity.repeat_non_converters),
        multiInterestVisitors: numberValue(opportunity.multi_interest_visitors),
        paidSessions: numberValue(opportunity.paid_sessions),
        paidEngagementRate: numberValue(opportunity.paid_engagement_rate),
        baselineEngagementRate: numberValue(opportunity.baseline_engagement_rate),
        organicSessions: numberValue(opportunity.organic_sessions),
        organicEngagementRate: numberValue(opportunity.organic_engagement_rate),
        organicBaselineEngagementRate: numberValue(opportunity.organic_baseline_engagement_rate),
        strongOrganicPages: numberValue(opportunity.strong_organic_pages),
        leadActions: numberValue(opportunity.lead_actions),
        previousLeadActions: numberValue(opportunity.previous_lead_actions),
        confirmedLeads: numberValue(opportunity.confirmed_leads),
        previousConfirmedLeads: numberValue(opportunity.previous_confirmed_leads),
        divergentClients: numberValue(opportunity.divergent_clients)
      })
    : []

  const clients: AudienceClientRow[] = clientRows.map(row => {
    const visitors = numberValue(row.visitors)
    const sessions = numberValue(row.sessions)
    const engagedSessions = numberValue(row.engaged_sessions)
    const confirmedLeads = numberValue(row.confirmed_leads)
    return {
      clientId: row.client_id,
      clientName: row.client_name,
      siteCount: numberValue(row.site_count),
      status: clientStatus(row),
      visitors,
      engagementRate: safeRate(engagedSessions, sessions),
      leadActions: numberValue(row.lead_actions),
      confirmedLeads,
      visitorToLeadRate: safeRate(confirmedLeads, visitors),
      attributionCoverage: safeRate(numberValue(row.attributed_leads), confirmedLeads),
      visitorsDeltaPercent: periodDelta(visitors, numberValue(row.previous_visitors)),
      lastEventAt: row.last_event_at
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    window: input.range,
    coverage: {
      total: sites.length,
      receiving: sites.filter(site => site.status === 'receiving').length,
      stale: sites.filter(site => site.status === 'stale').length,
      noRecentData: sites.filter(site => site.status === 'no_recent_data').length,
      neverReceived: sites.filter(site => site.status === 'never_received').length,
      inactive: sites.filter(site => site.status === 'inactive').length,
      sites
    },
    kpis: currentKpis,
    previousKpis,
    opportunities,
    clients,
    availableClients: availableClients.map(client => ({ id: client.id, name: client.name }))
  }
}

export async function getAudienceTimeseries(input: {
  range: AudienceRange
  clientIds: ClientScope
  metric: AudienceMetric
}): Promise<AudienceTimeseriesResponse> {
  if (Array.isArray(input.clientIds) && input.clientIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      window: input.range,
      metric: input.metric,
      current: zeroFillAudienceSeries([], input.range.fromDate, input.range.toDate),
      previous: zeroFillAudienceSeries([], input.range.previousFromDate, input.range.previousToDate)
    }
  }

  const rows = await withAudienceQueryTiming('timeseries', () => queryRows<TimeseriesRow>(
    `/* audience:timeseries */
     WITH periods(period, from_date, to_date) AS (
       VALUES
         ('current'::text, $2::date, $3::date),
         ('previous'::text, $4::date, $5::date)
     ),
     event_daily AS (
       SELECT p.period,
              to_char((e.received_at AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))::date, 'YYYY-MM-DD') AS day,
              COUNT(DISTINCT e.anon_id) AS visitors,
              COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'engagement') AS engaged_sessions,
              COUNT(DISTINCT e.session_id) FILTER (
                WHERE e.event_name IN ('form_submit', 'phone_click', 'generate_lead', 'test_drive_booking')
              ) AS lead_actions
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         JOIN tracking_events e ON e.client_id = c.id
        WHERE e.received_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND e.received_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND ${QUALIFYING_EVENTS_SQL}
        GROUP BY p.period, day
     ),
     outcome_daily AS (
       SELECT p.period,
              to_char((intent.occurred_at AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))::date, 'YYYY-MM-DD') AS day,
              COUNT(DISTINCT intent.matched_lead_id)
                FILTER (WHERE intent.matched_lead_id IS NOT NULL) AS confirmed_leads
         FROM periods p
         JOIN agency_clients c
           ON ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))
         JOIN lead_submission_intents intent ON intent.client_id = c.id
        WHERE intent.occurred_at >= (p.from_date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND intent.occurred_at < ((p.to_date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
        GROUP BY p.period, day
     ),
     keys AS (
       SELECT period, day FROM event_daily
       UNION
       SELECT period, day FROM outcome_daily
     )
     SELECT keys.period,
            keys.day,
            COALESCE(events.visitors, 0)::text AS visitors,
            COALESCE(events.sessions, 0)::text AS sessions,
            COALESCE(events.engaged_sessions, 0)::text AS engaged_sessions,
            COALESCE(events.lead_actions, 0)::text AS lead_actions,
            COALESCE(outcomes.confirmed_leads, 0)::text AS confirmed_leads
       FROM keys
       LEFT JOIN event_daily events USING (period, day)
       LEFT JOIN outcome_daily outcomes USING (period, day)
      ORDER BY keys.period, keys.day`,
    [
      input.clientIds,
      input.range.fromDate,
      input.range.toDate,
      input.range.previousFromDate,
      input.range.previousToDate
    ]
  ))

  const mapped = rows.map(row => ({
    day: row.day,
    visitors: numberValue(row.visitors),
    sessions: numberValue(row.sessions),
    engagedSessions: numberValue(row.engaged_sessions),
    leadActions: numberValue(row.lead_actions),
    confirmedLeads: numberValue(row.confirmed_leads)
  }))

  return {
    generatedAt: new Date().toISOString(),
    window: input.range,
    metric: input.metric,
    current: zeroFillAudienceSeries(
      mapped.filter((_, index) => rows[index]?.period === 'current'),
      input.range.fromDate,
      input.range.toDate
    ),
    previous: zeroFillAudienceSeries(
      mapped.filter((_, index) => rows[index]?.period === 'previous'),
      input.range.previousFromDate,
      input.range.previousToDate
    )
  }
}

const BREAKDOWN_SQL: Record<AudienceBreakdownDimension, { expression: string, condition?: string }> = {
  source: {
    expression: `COALESCE(NULLIF(e.utm_source, ''), '(direct / untagged)')`
  },
  campaign: {
    expression: `COALESCE(NULLIF(e.utm_campaign, ''), '(untagged)')`
  },
  page: {
    expression: `COALESCE(NULLIF(e.page_url, ''), '(unknown page)')`
  },
  paid_organic: {
    expression: `CASE
      WHEN e.gclid IS NOT NULL OR e.gbraid IS NOT NULL OR e.wbraid IS NOT NULL
        OR e.fbclid IS NOT NULL OR e.msclkid IS NOT NULL OR e.ttclid IS NOT NULL
        OR e.utm_medium ~* '(cpc|ppc|paid|display)' THEN 'paid'
      WHEN NULLIF(e.utm_source, '') IS NOT NULL OR NULLIF(e.referrer, '') IS NOT NULL THEN 'organic'
      ELSE 'direct'
    END`
  },
  device: {
    expression: `CASE
      WHEN e.ua ~* '(iPad|Tablet)' OR (e.ua ~* 'Android' AND e.ua !~* 'Mobile') THEN 'tablet'
      WHEN e.ua ~* '(Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)' THEN 'mobile'
      WHEN e.ua IS NULL THEN 'unknown'
      ELSE 'desktop'
    END`
  },
  interest: {
    expression: `COALESCE(
      NULLIF(e.event_data->>'vehicle_model', ''),
      NULLIF(e.event_data->>'vehicle_name', ''),
      NULLIF(e.event_data->>'model', ''),
      '(unspecified)'
    )`,
    condition: `AND e.event_name IN ('vehicle_view', 'vehicle_list_view', 'return_to_vehicle')`
  }
}

export async function getAudienceBreakdowns(input: {
  range: AudienceRange
  clientIds: ClientScope
  dimension: AudienceBreakdownDimension
}): Promise<AudienceBreakdownsResponse> {
  if (Array.isArray(input.clientIds) && input.clientIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      window: input.range,
      dimension: input.dimension,
      rows: []
    }
  }

  const definition = BREAKDOWN_SQL[input.dimension]
  const rows = await withAudienceQueryTiming('breakdown', () => queryRows<BreakdownRow>(
    `/* audience:breakdown */
     WITH scoped AS (
       SELECT e.site_id,
              e.event_id,
              e.client_id,
              e.anon_id,
              e.session_id,
              e.event_name,
              ${definition.expression} AS key
         FROM tracking_events e
         JOIN agency_clients c ON c.id = e.client_id
        WHERE ($1::uuid[] IS NULL OR e.client_id = ANY($1::uuid[]))
          AND e.received_at >= ($2::date AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND e.received_at < (($3::date + INTERVAL '1 day') AT TIME ZONE COALESCE(c.reporting_timezone, 'Australia/Brisbane'))
          AND ${QUALIFYING_EVENTS_SQL}
          ${definition.condition ?? ''}
     ),
     event_metrics AS (
       SELECT key,
              COUNT(DISTINCT anon_id) AS visitors
         FROM scoped
        GROUP BY key
     ),
     session_metrics AS (
       SELECT key,
              COUNT(DISTINCT session_id) AS sessions,
              COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'engagement') AS engaged_sessions,
              COUNT(DISTINCT session_id) FILTER (
                WHERE event_name IN ('form_submit', 'phone_click', 'generate_lead', 'test_drive_booking')
              ) AS lead_actions
         FROM scoped
        GROUP BY key
     ),
     outcome_metrics AS (
       SELECT scoped.key,
              COUNT(DISTINCT intent.matched_lead_id)
                FILTER (WHERE intent.matched_lead_id IS NOT NULL) AS confirmed_leads
         FROM scoped
         LEFT JOIN lead_submission_intents intent
           ON intent.site_id = scoped.site_id
          AND intent.browser_event_id = scoped.event_id
        GROUP BY scoped.key
     )
     SELECT events.key,
            events.visitors::text,
            COALESCE(sessions.sessions, 0)::text AS sessions,
            COALESCE(sessions.engaged_sessions, 0)::text AS engaged_sessions,
            COALESCE(sessions.lead_actions, 0)::text AS lead_actions,
            COALESCE(outcomes.confirmed_leads, 0)::text AS confirmed_leads
       FROM event_metrics events
       LEFT JOIN session_metrics sessions USING (key)
       LEFT JOIN outcome_metrics outcomes USING (key)
      ORDER BY events.visitors DESC, events.key
      LIMIT 20`,
    [input.clientIds, input.range.fromDate, input.range.toDate]
  ))

  return {
    generatedAt: new Date().toISOString(),
    window: input.range,
    dimension: input.dimension,
    rows: rows.map(row => {
      const sessions = numberValue(row.sessions)
      const engagedSessions = numberValue(row.engaged_sessions)
      const confirmedLeads = numberValue(row.confirmed_leads)
      return {
        key: row.key,
        visitors: numberValue(row.visitors),
        sessions,
        engagementRate: safeRate(engagedSessions, sessions),
        leadActions: numberValue(row.lead_actions),
        confirmedLeads,
        confirmedLeadRate: safeRate(confirmedLeads, sessions)
      }
    })
  }
}
