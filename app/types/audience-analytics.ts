export type AudienceSiteStatus = 'receiving' | 'stale' | 'no_recent_data' | 'never_received' | 'inactive'

export type AudienceMetric =
  | 'visitors'
  | 'sessions'
  | 'engagedSessions'
  | 'leadActions'
  | 'confirmedLeads'

export type AudienceBreakdownDimension =
  | 'source'
  | 'campaign'
  | 'page'
  | 'paid_organic'
  | 'device'
  | 'interest'

export type AudienceOpportunityStatus = 'opportunity' | 'insufficient_data'

export interface AudienceRange {
  fromDate: string
  toDate: string
  previousFromDate: string
  previousToDate: string
  days: number
}

export interface AudienceKpis {
  visitors: number
  sessions: number
  pageViews: number
  engagedSessions: number
  engagementRate: number
  repeatVisitors: number
  leadActions: number
  confirmedLeads: number
  visitorToLeadRate: number
  attributionCoverage: number
}

export interface AudienceSiteRow {
  id: string
  clientId: string
  clientName: string
  name: string
  origin: string | null
  isActive: boolean
  status: AudienceSiteStatus
  lastEventAt: string | null
  eventsInWindow: number
}

export type AudienceOpportunityCode =
  | 'high_intent_non_converters'
  | 'repeat_non_converters'
  | 'multi_interest'
  | 'weak_paid_engagement'
  | 'strong_organic_pages'
  | 'intent_outcome_divergence'

export interface AudienceOpportunity {
  code: AudienceOpportunityCode
  title: string
  description: string
  status: AudienceOpportunityStatus
  count: number
  thresholds: Record<string, number>
  evidence: Record<string, number | string>
  clientId?: string
}

export interface AudienceClientRow {
  clientId: string
  clientName: string
  siteCount: number
  status: AudienceSiteStatus
  visitors: number
  engagementRate: number
  leadActions: number
  confirmedLeads: number
  visitorToLeadRate: number
  attributionCoverage: number
  visitorsDeltaPercent: number | null
  lastEventAt: string | null
}

export interface AudienceOverviewResponse {
  generatedAt: string
  window: AudienceRange
  coverage: {
    total: number
    receiving: number
    stale: number
    noRecentData: number
    neverReceived: number
    inactive: number
    sites: AudienceSiteRow[]
  }
  kpis: AudienceKpis
  previousKpis: AudienceKpis
  opportunities: AudienceOpportunity[]
  clients: AudienceClientRow[]
  availableClients: Array<{ id: string, name: string }>
}

export interface AudienceSeriesPoint extends Pick<AudienceKpis,
  'visitors' | 'sessions' | 'engagedSessions' | 'leadActions' | 'confirmedLeads'> {
  day: string
  dayIndex: number
}

export interface AudienceTimeseriesResponse {
  generatedAt: string
  window: AudienceRange
  metric: AudienceMetric
  current: AudienceSeriesPoint[]
  previous: AudienceSeriesPoint[]
}

export interface AudienceBreakdownRow {
  key: string
  visitors: number
  sessions: number
  engagementRate: number
  leadActions: number
  confirmedLeads: number
  confirmedLeadRate: number
}

export interface AudienceBreakdownsResponse {
  generatedAt: string
  window: AudienceRange
  dimension: AudienceBreakdownDimension
  rows: AudienceBreakdownRow[]
}

export interface AudienceGrounding {
  window: AudienceRange
  scope: 'agency' | 'client'
  kpis: AudienceKpis
  previousKpis: AudienceKpis
  opportunities: AudienceOpportunity[]
  breakdowns: Partial<Record<AudienceBreakdownDimension, AudienceBreakdownRow[]>>
}

export interface AudienceAskResponse {
  answer: string
  generatedAt: string
  grounding: AudienceGrounding
}
