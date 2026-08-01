import type {
  AudienceBreakdownDimension,
  AudienceBreakdownRow,
  AudienceGrounding,
  AudienceKpis,
  AudienceOpportunity,
  AudienceRange,
  AudienceSeriesPoint,
  AudienceSiteStatus
} from '~~/app/types/audience-analytics'

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const BREAKDOWN_DIMENSIONS = new Set<AudienceBreakdownDimension>([
  'source',
  'campaign',
  'page',
  'paid_organic',
  'device',
  'interest'
])

export const AUDIENCE_OPPORTUNITY_THRESHOLDS = {
  minimumSessions: 20,
  strongEngagementSeconds: 45,
  deepScrollPercent: 75,
  multiInterestCount: 2,
  weakPaidEngagementGapPoints: 15,
  strongOrganicLiftPoints: 10,
  divergenceMinimumLeadActions: 5
} as const

export interface AudienceOpportunityInput {
  sessions: number
  highIntentNonConverters: number
  repeatNonConverters: number
  multiInterestVisitors: number
  paidSessions: number
  paidEngagementRate: number
  baselineEngagementRate: number
  organicSessions: number
  organicEngagementRate: number
  organicBaselineEngagementRate: number
  strongOrganicPages: number
  leadActions: number
  previousLeadActions: number
  confirmedLeads: number
  previousConfirmedLeads: number
  divergentClients: number
}

type SeriesInput = Omit<AudienceSeriesPoint, 'dayIndex'>

type AudienceGroundingInput = AudienceGrounding & Record<string, unknown>

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || ymd(parsed) !== value ? null : parsed
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export function parseAudienceRange(
  query: { from?: string, to?: string },
  now: () => Date = () => new Date()
): AudienceRange {
  const current = now()
  const defaultTo = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate()
  ))
  const to = query.to ? parseDate(query.to) : defaultTo
  const from = query.from ? parseDate(query.from) : shiftDays(to!, -29)

  if (!from || !to) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid from/to date' })
  }
  if (from.getTime() > to.getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'from must be <= to' })
  }

  const days = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1
  if (days > 90) {
    throw createError({ statusCode: 400, statusMessage: 'Range too large (max 90 days)' })
  }

  const previousTo = shiftDays(from, -1)
  const previousFrom = shiftDays(previousTo, -(days - 1))
  return {
    fromDate: ymd(from),
    toDate: ymd(to),
    previousFromDate: ymd(previousFrom),
    previousToDate: ymd(previousTo),
    days
  }
}

export function deriveAudienceSiteStatus(
  active: boolean,
  latestEventAt: string | null,
  now: () => Date = () => new Date()
): AudienceSiteStatus {
  if (!active) return 'inactive'
  if (!latestEventAt) return 'never_received'

  const latest = new Date(latestEventAt)
  if (Number.isNaN(latest.getTime())) return 'never_received'
  const ageMs = Math.max(0, now().getTime() - latest.getTime())
  if (ageMs <= DAY_MS) return 'receiving'
  if (ageMs <= 7 * DAY_MS) return 'stale'
  return 'no_recent_data'
}

export function safeRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator < 0 || denominator <= 0) {
    return 0
  }
  return Math.round((numerator / denominator) * 1000) / 10
}

export function periodDelta(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return 0
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function zeroFillAudienceSeries(
  rows: SeriesInput[],
  fromDate: string,
  toDate: string
): AudienceSeriesPoint[] {
  const from = parseDate(fromDate)
  const to = parseDate(toDate)
  if (!from || !to || from > to) return []

  const byDay = new Map(rows.map(row => [row.day, row]))
  const points: AudienceSeriesPoint[] = []
  for (let cursor = from, dayIndex = 0; cursor <= to; cursor = shiftDays(cursor, 1), dayIndex += 1) {
    const day = ymd(cursor)
    const row = byDay.get(day)
    points.push({
      day,
      dayIndex,
      visitors: row?.visitors ?? 0,
      sessions: row?.sessions ?? 0,
      engagedSessions: row?.engagedSessions ?? 0,
      leadActions: row?.leadActions ?? 0,
      confirmedLeads: row?.confirmedLeads ?? 0
    })
  }
  return points
}

function insufficientOpportunity(
  code: AudienceOpportunity['code'],
  title: string,
  description: string,
  count: number,
  thresholds: Record<string, number>,
  evidence: Record<string, number | string>
): AudienceOpportunity {
  return { code, title, description, status: 'insufficient_data', count, thresholds, evidence }
}

function publishedOpportunity(
  code: AudienceOpportunity['code'],
  title: string,
  description: string,
  count: number,
  thresholds: Record<string, number>,
  evidence: Record<string, number | string>
): AudienceOpportunity {
  return { code, title, description, status: 'opportunity', count, thresholds, evidence }
}

export function deriveAudienceOpportunities(input: AudienceOpportunityInput): AudienceOpportunity[] {
  const t = AUDIENCE_OPPORTUNITY_THRESHOLDS
  const opportunities: Array<AudienceOpportunity | null> = []
  const sessionEvidence = { sessions: input.sessions }
  const sessionThreshold = { minimumSessions: t.minimumSessions }

  opportunities.push(input.sessions < t.minimumSessions
    ? insufficientOpportunity(
        'high_intent_non_converters',
        'High-intent visitors have not converted',
        'More sessions are needed before this pattern can be assessed.',
        input.highIntentNonConverters,
        sessionThreshold,
        sessionEvidence
      )
    : input.highIntentNonConverters > 0
      ? publishedOpportunity(
          'high_intent_non_converters',
          'High-intent visitors have not converted',
          'Strong on-site intent occurred without a recorded lead action.',
          input.highIntentNonConverters,
          {
            ...sessionThreshold,
            strongEngagementSeconds: t.strongEngagementSeconds,
            deepScrollPercent: t.deepScrollPercent
          },
          { ...sessionEvidence, highIntentNonConverters: input.highIntentNonConverters }
        )
      : null)

  opportunities.push(input.sessions < t.minimumSessions
    ? insufficientOpportunity(
        'repeat_non_converters',
        'Repeat visitors have not converted',
        'More sessions are needed before repeat behaviour can be assessed.',
        input.repeatNonConverters,
        sessionThreshold,
        sessionEvidence
      )
    : input.repeatNonConverters > 0
      ? publishedOpportunity(
          'repeat_non_converters',
          'Repeat visitors have not converted',
          'Visitors returned in multiple sessions without a recorded lead action.',
          input.repeatNonConverters,
          sessionThreshold,
          { ...sessionEvidence, repeatNonConverters: input.repeatNonConverters }
        )
      : null)

  opportunities.push(input.sessions < t.minimumSessions
    ? insufficientOpportunity(
        'multi_interest',
        'Visitors are comparing multiple products',
        'More sessions are needed before cross-product interest can be assessed.',
        input.multiInterestVisitors,
        { ...sessionThreshold, multiInterestCount: t.multiInterestCount },
        sessionEvidence
      )
    : input.multiInterestVisitors > 0
      ? publishedOpportunity(
          'multi_interest',
          'Visitors are comparing multiple products',
          'These visitors viewed more than one distinct vehicle or product reference.',
          input.multiInterestVisitors,
          { ...sessionThreshold, multiInterestCount: t.multiInterestCount },
          { ...sessionEvidence, multiInterestVisitors: input.multiInterestVisitors }
        )
      : null)

  const paidGap = Math.round((input.baselineEngagementRate - input.paidEngagementRate) * 10) / 10
  opportunities.push(input.paidSessions < t.minimumSessions
    ? insufficientOpportunity(
        'weak_paid_engagement',
        'Paid traffic is engaging below baseline',
        'More paid sessions are needed before traffic quality can be compared.',
        input.paidSessions,
        { minimumPaidSessions: t.minimumSessions, engagementGapPoints: t.weakPaidEngagementGapPoints },
        { paidSessions: input.paidSessions }
      )
    : paidGap >= t.weakPaidEngagementGapPoints
      ? publishedOpportunity(
          'weak_paid_engagement',
          'Paid traffic is engaging below baseline',
          'Paid-session engagement is materially below the selected audience baseline.',
          input.paidSessions,
          { minimumPaidSessions: t.minimumSessions, engagementGapPoints: t.weakPaidEngagementGapPoints },
          {
            paidSessions: input.paidSessions,
            paidEngagementRate: input.paidEngagementRate,
            baselineEngagementRate: input.baselineEngagementRate,
            engagementGapPoints: paidGap
          }
        )
      : null)

  const organicLift = Math.round((input.organicEngagementRate - input.organicBaselineEngagementRate) * 10) / 10
  opportunities.push(input.organicSessions < t.minimumSessions
    ? insufficientOpportunity(
        'strong_organic_pages',
        'Organic landing pages are outperforming',
        'More organic sessions are needed before page quality can be compared.',
        input.strongOrganicPages,
        { minimumOrganicSessions: t.minimumSessions, engagementLiftPoints: t.strongOrganicLiftPoints },
        { organicSessions: input.organicSessions }
      )
    : organicLift >= t.strongOrganicLiftPoints && input.strongOrganicPages > 0
      ? publishedOpportunity(
          'strong_organic_pages',
          'Organic landing pages are outperforming',
          'These landing pages show meaningful volume and above-baseline engagement.',
          input.strongOrganicPages,
          { minimumOrganicSessions: t.minimumSessions, engagementLiftPoints: t.strongOrganicLiftPoints },
          {
            organicSessions: input.organicSessions,
            organicEngagementRate: input.organicEngagementRate,
            organicBaselineEngagementRate: input.organicBaselineEngagementRate,
            engagementLiftPoints: organicLift
          }
        )
      : null)

  const enoughIntent = input.leadActions >= t.divergenceMinimumLeadActions
  opportunities.push(!enoughIntent
    ? insufficientOpportunity(
        'intent_outcome_divergence',
        'Lead intent and confirmed outcomes are diverging',
        'More lead actions are needed before outcome movement can be compared.',
        input.divergentClients,
        { minimumLeadActions: t.divergenceMinimumLeadActions },
        { leadActions: input.leadActions }
      )
    : input.leadActions > input.previousLeadActions
      && input.confirmedLeads < input.previousConfirmedLeads
      && input.divergentClients > 0
      ? publishedOpportunity(
          'intent_outcome_divergence',
          'Lead intent and confirmed outcomes are diverging',
          'Lead actions increased while confirmed leads decreased.',
          input.divergentClients,
          { minimumLeadActions: t.divergenceMinimumLeadActions },
          {
            leadActions: input.leadActions,
            previousLeadActions: input.previousLeadActions,
            confirmedLeads: input.confirmedLeads,
            previousConfirmedLeads: input.previousConfirmedLeads
          }
        )
      : null)

  return opportunities.filter((item): item is AudienceOpportunity => item !== null)
}

function pickKpis(input: AudienceKpis): AudienceKpis {
  return {
    visitors: input.visitors,
    sessions: input.sessions,
    pageViews: input.pageViews,
    engagedSessions: input.engagedSessions,
    engagementRate: input.engagementRate,
    repeatVisitors: input.repeatVisitors,
    leadActions: input.leadActions,
    confirmedLeads: input.confirmedLeads,
    visitorToLeadRate: input.visitorToLeadRate,
    attributionCoverage: input.attributionCoverage
  }
}

function pickOpportunity(input: AudienceOpportunity): AudienceOpportunity {
  return {
    code: input.code,
    title: input.title,
    description: input.description,
    status: input.status,
    count: input.count,
    thresholds: { ...input.thresholds },
    evidence: { ...input.evidence },
    ...(input.clientId ? { clientId: input.clientId } : {})
  }
}

function pickBreakdownRow(input: AudienceBreakdownRow): AudienceBreakdownRow {
  return {
    key: input.key,
    visitors: input.visitors,
    sessions: input.sessions,
    engagementRate: input.engagementRate,
    leadActions: input.leadActions,
    confirmedLeads: input.confirmedLeads,
    confirmedLeadRate: input.confirmedLeadRate
  }
}

export function buildAudienceGrounding(input: AudienceGroundingInput): AudienceGrounding {
  const breakdowns: AudienceGrounding['breakdowns'] = {}
  for (const [dimension, rows] of Object.entries(input.breakdowns ?? {})) {
    if (!BREAKDOWN_DIMENSIONS.has(dimension as AudienceBreakdownDimension) || !Array.isArray(rows)) continue
    breakdowns[dimension as AudienceBreakdownDimension] = rows
      .slice(0, 10)
      .map(row => pickBreakdownRow(row))
  }

  return {
    window: {
      fromDate: input.window.fromDate,
      toDate: input.window.toDate,
      previousFromDate: input.window.previousFromDate,
      previousToDate: input.window.previousToDate,
      days: input.window.days
    },
    scope: input.scope,
    kpis: pickKpis(input.kpis),
    previousKpis: pickKpis(input.previousKpis),
    opportunities: input.opportunities.slice(0, 10).map(item => pickOpportunity(item)),
    breakdowns
  }
}
