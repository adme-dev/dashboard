export type SiteIntelligenceLane = 'owned' | 'competitor'
export type SiteIntelligenceDomainStatus = 'active' | 'paused'
export type SiteIntelligenceDiscoveryMode = 'all' | 'sitemaps' | 'links'
export type SiteIntelligenceRenderMode = 'auto' | 'static' | 'browser'
export type SiteIntelligenceFrequency = 'daily' | 'weekly' | 'manual'
export type SiteIntelligenceCrawlPurpose = 'search' | 'ai-input'
export type SiteIntelligenceRunTrigger = 'manual' | 'schedule' | 'retry'
export type SiteIntelligenceRunStatus
  = 'queued' | 'running' | 'completed' | 'partial' | 'blocked' | 'failed' | 'cancelled'
export type SiteIntelligencePageStatus = 'completed' | 'disallowed' | 'skipped' | 'errored' | 'cancelled'
export type SiteIntelligencePageType
  = 'homepage' | 'model' | 'inventory' | 'offer' | 'finance' | 'service'
    | 'location' | 'landing_page' | 'article' | 'other'
export type SiteIntelligenceInsightType
  = 'offer_change' | 'offer_gap' | 'landing_mismatch' | 'high_traffic_stale_content'
    | 'content_gap' | 'conversion_context'
export type SiteIntelligenceInsightStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed'
export type SiteIntelligenceReviewStatus = 'unreviewed' | 'confirmed' | 'dismissed'
export type NearbyMarketRadius = 10 | 25 | 50
export type DealerCategory = 'franchise_new' | 'used' | 'independent' | 'unclassified'
export type SiteIntelligenceCandidateState = 'saved' | 'nominated' | 'approved' | 'dismissed'
export type SiteIntelligenceCandidateSource = 'agency' | 'client_portal'
export type CandidateState = SiteIntelligenceCandidateState
export type CandidateSource = SiteIntelligenceCandidateSource
export type PortalCandidateState = 'suggested' | 'under_review' | 'monitored' | 'not_selected'

export interface ClientMarketLocation {
  id: string
  clientId: string
  label: string
  addressText: string
  googlePlaceId: string
  isPrimary: boolean
  confirmedAt: string
  confirmedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface NearbyMarketCandidate {
  placeId: string
  displayName: string
  formattedAddress: string
  location: { latitude: number, longitude: number }
  distanceKm: number
  category: DealerCategory
  state: SiteIntelligenceCandidateState | null
  source: SiteIntelligenceCandidateSource | null
  approvedDomainId: string | null
  portalState: PortalCandidateState | null
}

export interface NearbyMarketResponse {
  clientId: string
  marketLocation: ClientMarketLocation | null
  center: { latitude: number, longitude: number } | null
  radiusKm: NearbyMarketRadius
  candidates: NearbyMarketCandidate[]
  limited: boolean
}

export interface NearbyMarketCandidateReview {
  placeId: string
  displayName: string
  websiteUri: string | null
  canonicalOrigin: string | null
  existingDomainId: string | null
  canApprove: boolean
}

export interface NearbyMarketCandidateDecisionContext {
  clientId: string
  marketLocationId: string
  radiusKm: NearbyMarketRadius
}

export type NearbyMarketCandidateDecision = NearbyMarketCandidateDecisionContext & (
  | { action: 'save' }
  | { action: 'dismiss', reviewerReason: string }
  | { action: 'approve_and_index', reviewerReason: string, websiteUri?: string }
)

export interface SiteIntelligenceDomain {
  id: string
  clientId: string
  clientName?: string
  lane: SiteIntelligenceLane
  name: string
  origin: string
  justification: string
  approvedBy: string | null
  approvedAt: string | null
  status: SiteIntelligenceDomainStatus
  discoveryMode: SiteIntelligenceDiscoveryMode
  includePatterns: string[]
  excludePatterns: string[]
  includeSubdomains: boolean
  renderMode: SiteIntelligenceRenderMode
  pageLimit: number
  depth: number
  frequency: SiteIntelligenceFrequency
  crawlPurposes: SiteIntelligenceCrawlPurpose[]
  aiInputAllowed: boolean
  retentionDays: number
  lastRunAt: string | null
  nextRunAt: string | null
  latestRunStatus: SiteIntelligenceRunStatus | null
  createdAt: string
  updatedAt: string
}

export interface SiteIntelligenceCrawlSettings {
  origin: string
  lane: SiteIntelligenceLane
  discoveryMode: SiteIntelligenceDiscoveryMode
  includePatterns: string[]
  excludePatterns: string[]
  includeSubdomains: boolean
  renderMode: SiteIntelligenceRenderMode
  pageLimit: number
  depth: number
  crawlPurposes: SiteIntelligenceCrawlPurpose[]
  aiInputAllowed: boolean
  retentionDays: number
}

export interface SiteIntelligenceRun {
  id: string
  clientId: string
  domainId: string
  trigger: SiteIntelligenceRunTrigger
  status: SiteIntelligenceRunStatus
  workflowInstanceId: string | null
  cloudflareJobId: string | null
  settings: SiteIntelligenceCrawlSettings
  totalPages: number
  completedPages: number
  changedPages: number
  disallowedPages: number
  erroredPages: number
  browserSeconds: number | null
  errorCategory: string | null
  errorSummary: string | null
  requestedBy: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AutomotiveFinanceFacts {
  deposit: number | null
  depositDisplay: string | null
  repayment: number | null
  repaymentDisplay: string | null
  repaymentPeriod: string | null
  comparisonRate: number | null
  comparisonRateDisplay: string | null
  termMonths: number | null
  termDisplay: string | null
  balloon: number | null
  balloonDisplay: string | null
  eligibility: string | null
}

export interface AutomotivePageFacts {
  pageType: SiteIntelligencePageType
  brand: string | null
  model: string | null
  variant: string | null
  bodyType: string | null
  powertrain: string | null
  modelYear: number | null
  stockState: 'new' | 'demonstrator' | 'used' | 'in_stock' | null
  driveAwayPrice: number | null
  driveAwayPriceDisplay: string | null
  listPrice: number | null
  listPriceDisplay: string | null
  discount: number | null
  discountDisplay: string | null
  offerTypes: string[]
  finance: AutomotiveFinanceFacts
  expiry: string | null
  ctas: string[]
  disclaimers: string[]
}

export interface SiteIntelligencePageSummary {
  id: string
  clientId: string
  domainId: string
  canonicalUrl: string
  sourceUrl: string
  status: SiteIntelligencePageStatus
  httpStatus: number | null
  title: string | null
  contentHash: string | null
  facts: Partial<AutomotivePageFacts>
  aiSummary: string | null
  firstSeenAt: string
  lastSeenAt: string
  lastChangedAt: string | null
}

export interface SiteIntelligenceFactDiff {
  material: boolean
  changedFields: string[]
  before: Record<string, string | number | boolean | null>
  after: Record<string, string | number | boolean | null>
  evidence: Array<{ field: string, excerpt: string }>
}

export interface SiteIntelligenceChange {
  id: string
  clientId: string
  domainId: string
  pageId: string
  runId: string
  lane: SiteIntelligenceLane
  changeType: string
  factDiff: SiteIntelligenceFactDiff
  sourceUrl: string
  observedAt: string
  confidence: number
  reviewStatus: SiteIntelligenceReviewStatus
}

export interface SiteIntelligenceInsight {
  id: string
  clientId: string
  type: SiteIntelligenceInsightType
  lane: SiteIntelligenceLane | 'cross_lane'
  title: string
  summary: string
  confidence: number
  deterministic: boolean
  ruleVersion: string
  evidencePageIds: string[]
  evidenceChangeIds: string[]
  evidenceUrls: string[]
  status: SiteIntelligenceInsightStatus
  observedAt: string
  generatedAt: string
  assignedTo: string | null
  taskId: string | null
}

export interface SiteIntelligenceOverviewResponse {
  generatedAt: string
  availableClients: Array<{ id: string, name: string }>
  domains: SiteIntelligenceDomain[]
  runs: SiteIntelligenceRun[]
  insights: SiteIntelligenceInsight[]
  coverage: {
    total: number
    active: number
    paused: number
    neverRun: number
    blocked: number
    failed: number
  }
}

export interface SiteIntelligenceChangeResponse {
  generatedAt: string
  rows: SiteIntelligenceChange[]
  pagination: { cursor: string | null, hasMore: boolean }
}

export interface SiteIntelligenceGap {
  key: string
  type: 'offer' | 'content'
  status: 'gap' | 'insufficient_data'
  comparisonLevel: 'exact_model' | 'category' | 'none'
  clientId: string
  ownedPageId: string | null
  competitorPageIds: string[]
  title: string
  explanation: string
  confidence: number
  evidenceUrls: string[]
  observedAt: string
}

export interface SiteIntelligenceGapResponse {
  generatedAt: string
  rows: SiteIntelligenceGap[]
}
