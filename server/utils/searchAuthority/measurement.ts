import { queryRows } from '~~/server/utils/db'

export interface SearchAuthorityMeasurementInput {
  startDate: string
  endDate: string
  publications: Array<{
    id: string
    publicUrl: string
    title: string
    publishedAt: string
    measurementAvailable?: boolean
  }>
  events: Array<{
    eventId: string
    eventName: string
    pageUrl: string | null
    occurredAt: string
    eventData: Record<string, unknown>
  }>
  leads: Array<{
    id: string
    submittedAt: string
    attribution: Record<string, unknown> | null
  }>
  ga4LandingPages: Array<{
    metricDate: string
    dimensionValue: string
    sessions: number
  }>
}

export interface SearchAuthorityMeasurementSummary {
  window: { startDate: string, endDate: string }
  publications: Array<{
    id: string
    title: string
    publicUrl: string
    publishedAt: string
    measurementAvailable: boolean
    measuredViews: number
    measuredCtaHandoffs: number
    directLeads: number
    assistedLeads: number
  }>
  totals: {
    measuredViews: number
    measuredCtaHandoffs: number
    directLeads: number
    assistedLeads: number
  }
  unlinkedLeads: number
  ga4: { available: boolean, sessions: number | null, dataThroughDate: string | null }
  firstParty: { available: boolean }
  limitations: string[]
}

interface PublicationRow {
  id: string
  public_url: string
  title: string
  published_at: string
  measurement_enabled: boolean
}

interface EventRow {
  event_id: string
  event_name: string
  page_url: string | null
  occurred_at: string
  event_data: Record<string, unknown> | string | null
}

interface LeadRow {
  id: string
  submitted_at: string
  attribution: Record<string, unknown> | string | null
}

interface Ga4Row {
  metric_date: string
  dimension_value: string
  sessions: string
}

export async function loadSearchAuthorityMeasurement(
  clientId: string,
  window: { startDate: string, endDate: string }
): Promise<SearchAuthorityMeasurementSummary> {
  const [publications, events, leads, ga4Rows] = await Promise.all([
    queryRows<PublicationRow>(`
      SELECT publication.id, publication.public_url, asset.title, publication.published_at,
        publication.measurement_enabled
      FROM search_authority_publications publication
      JOIN search_authority_content_assets asset
        ON asset.client_id = publication.client_id AND asset.id = publication.asset_id
      WHERE publication.client_id = $1
        AND publication.status IN ('published', 'rolled_back')
        AND publication.public_url IS NOT NULL
        AND publication.published_at IS NOT NULL
        AND publication.published_at < ($2::date + INTERVAL '1 day')
      ORDER BY publication.published_at DESC
    `, [clientId, window.endDate]),
    queryRows<EventRow>(`
      SELECT event.event_id, event.event_name, event.page_url,
        COALESCE(event.occurred_at, event.received_at) AS occurred_at,
        event.event_data
      FROM tracking_events event
      WHERE event.client_id = $1
        AND COALESCE(event.occurred_at, event.received_at) >= $2::date
        AND COALESCE(event.occurred_at, event.received_at) < ($3::date + INTERVAL '1 day')
        AND event.event_name IN ('page_view', 'click')
        AND EXISTS (
          SELECT 1 FROM search_authority_publications publication
          WHERE publication.client_id = event.client_id
            AND publication.public_url IS NOT NULL
            AND split_part(event.page_url, '?', 1) = publication.public_url
        )
    `, [clientId, window.startDate, window.endDate]),
    queryRows<LeadRow>(`
      SELECT id, submitted_at, attribution
      FROM leads
      WHERE client_id = $1 AND deleted_at IS NULL
        AND submitted_at >= $2::date
        AND submitted_at < ($3::date + INTERVAL '1 day')
    `, [clientId, window.startDate, window.endDate]),
    queryRows<Ga4Row>(`
      SELECT metric_date, dimension_value, sessions
      FROM ga4_daily_dimension
      WHERE client_id = $1 AND dimension_type = 'landingPage'
        AND metric_date BETWEEN $2::date AND $3::date
        AND split_part(dimension_value, '?', 1) LIKE '/guides/%'
    `, [clientId, window.startDate, window.endDate])
  ])
  return summarizeSearchAuthorityMeasurement({
    ...window,
    publications: publications.map(row => ({
      id: row.id,
      publicUrl: row.public_url,
      title: row.title,
      publishedAt: row.published_at,
      measurementAvailable: row.measurement_enabled
    })),
    events: events.map(row => ({
      eventId: row.event_id,
      eventName: row.event_name,
      pageUrl: row.page_url,
      occurredAt: row.occurred_at,
      eventData: jsonObject(row.event_data)
    })),
    leads: leads.map(row => ({
      id: row.id,
      submittedAt: row.submitted_at,
      attribution: jsonObject(row.attribution)
    })),
    ga4LandingPages: ga4Rows.map(row => ({
      metricDate: row.metric_date,
      dimensionValue: row.dimension_value,
      sessions: Number(row.sessions)
    }))
  })
}

export function portalSearchAuthorityOutcomes(summary: SearchAuthorityMeasurementSummary) {
  return {
    window: summary.window,
    totals: summary.totals,
    unlinkedLeads: summary.unlinkedLeads,
    ga4: summary.ga4,
    firstParty: summary.firstParty,
    publications: summary.publications.map(publication => ({
      title: publication.title,
      publicUrl: publication.publicUrl,
      measuredViews: publication.measuredViews,
      measuredCtaHandoffs: publication.measuredCtaHandoffs,
      directLeads: publication.directLeads,
      assistedLeads: publication.assistedLeads
    })),
    limitations: summary.limitations
  }
}

export function publicationAttributionMarker(publicationId: string): string {
  return `publication_${publicationId}`
}

export function summarizeSearchAuthorityMeasurement(
  input: SearchAuthorityMeasurementInput
): SearchAuthorityMeasurementSummary {
  const start = new Date(`${input.startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${input.endDate}T23:59:59.999Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Measurement window is invalid')
  }
  const events = dedupeBy(input.events.filter(event => within(event.occurredAt, start, end)), event => event.eventId)
  const leads = dedupeBy(input.leads.filter(lead => within(lead.submittedAt, start, end)), lead => lead.id)
  const linkedLeadIds = new Set<string>()
  const eventsByPublication = new Map<string, typeof events>()
  for (const event of events) {
    const eventTime = new Date(event.occurredAt).getTime()
    const candidates = input.publications.filter(publication => (
      samePage(event.pageUrl, publication.publicUrl)
      && new Date(publication.publishedAt).getTime() <= eventTime
    ))
    const exactMarker = hrefMarker(event.eventData.href)
    const selected = candidates.find(publication => (
      exactMarker === publicationAttributionMarker(publication.id)
    )) || candidates.sort((left, right) => (
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
    ))[0]
    if (!selected) continue
    const existing = eventsByPublication.get(selected.id) || []
    existing.push(event)
    eventsByPublication.set(selected.id, existing)
  }
  const publications = input.publications.map((publication) => {
    const marker = publicationAttributionMarker(publication.id)
    let directLeads = 0
    let assistedLeads = 0
    for (const lead of leads) {
      const current = [
        text(lead.attribution?.utm_content),
        text(lead.attribution?.last_utm_content)
      ]
      const first = text(lead.attribution?.first_utm_content)
      if (current.includes(marker)) {
        directLeads += 1
        linkedLeadIds.add(lead.id)
      } else if (first === marker) {
        assistedLeads += 1
        linkedLeadIds.add(lead.id)
      }
    }
    const publicationEvents = eventsByPublication.get(publication.id) || []
    return {
      ...publication,
      measurementAvailable: publication.measurementAvailable !== false,
      measuredViews: publicationEvents.filter(event => event.eventName === 'page_view').length,
      measuredCtaHandoffs: publicationEvents.filter(event => (
        event.eventName === 'click'
        && hrefMarker(event.eventData.href) === marker
      )).length,
      directLeads,
      assistedLeads
    }
  })
  const ga4Rows = input.ga4LandingPages.filter(row => (
    within(`${row.metricDate}T12:00:00.000Z`, start, end)
    && publications.some(publication => landingPageMatches(row.dimensionValue, publication.publicUrl))
  ))
  const totals = publications.reduce((result, publication) => ({
    measuredViews: result.measuredViews + publication.measuredViews,
    measuredCtaHandoffs: result.measuredCtaHandoffs + publication.measuredCtaHandoffs,
    directLeads: result.directLeads + publication.directLeads,
    assistedLeads: result.assistedLeads + publication.assistedLeads
  }), { measuredViews: 0, measuredCtaHandoffs: 0, directLeads: 0, assistedLeads: 0 })
  const limitations = [
    'Search Console and GA4 are aggregate evidence and are not used to identify a person.',
    'Unlinked leads remain unknown; XeroFlow does not infer attribution from timing or query similarity.'
  ]
  if (!ga4Rows.length) limitations.push('GA4 landing-page evidence is unavailable for this window.')
  const firstPartyAvailable = publications.some(publication => publication.measurementAvailable)
  if (!firstPartyAvailable) limitations.push('First-party guide event measurement is unavailable for these publications.')
  return {
    window: { startDate: input.startDate, endDate: input.endDate },
    publications,
    totals,
    unlinkedLeads: leads.length - linkedLeadIds.size,
    ga4: ga4Rows.length
      ? {
          available: true,
          sessions: ga4Rows.reduce((total, row) => total + row.sessions, 0),
          dataThroughDate: ga4Rows.map(row => row.metricDate).sort().at(-1) || null
        }
      : { available: false, sessions: null, dataThroughDate: null },
    firstParty: { available: firstPartyAvailable },
    limitations
  }
}

function within(value: string, start: number, end: number): boolean {
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time >= start && time <= end
}

function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const value = key(row)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function jsonObject(value: Record<string, unknown> | string | null): Record<string, unknown> {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function samePage(value: string | null, publicUrl: string): boolean {
  if (!value) return false
  try {
    const eventUrl = new URL(value)
    const expected = new URL(publicUrl)
    return eventUrl.origin === expected.origin
      && eventUrl.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '')
  } catch {
    return false
  }
}

function hrefMarker(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).searchParams.get('utm_content')
  } catch {
    return null
  }
}

function landingPageMatches(value: string, publicUrl: string): boolean {
  try {
    const expected = new URL(publicUrl)
    const path = value.split('?')[0]?.replace(/\/$/, '')
    return path === expected.pathname.replace(/\/$/, '') || samePage(value, publicUrl)
  } catch {
    return false
  }
}
