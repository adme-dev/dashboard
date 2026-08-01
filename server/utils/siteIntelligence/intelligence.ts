import type { AudienceBreakdownRow } from '~~/app/types/audience-analytics'
import type {
  AutomotivePageFacts,
  SiteIntelligenceInsight,
  SiteIntelligenceLane,
  SiteIntelligencePageType
} from '~~/app/types/site-intelligence'

export const SITE_INTELLIGENCE_RULE_VERSION = 'automotive-intelligence-v1'

export interface SiteIntelligenceCandidatePage {
  id: string
  clientId: string
  domainId: string
  lane: SiteIntelligenceLane
  canonicalUrl: string
  sourceUrl: string
  facts: Partial<AutomotivePageFacts>
  observedAt: string
}

export interface SiteIntelligenceCandidateChange {
  id: string
  pageId: string
  lane: SiteIntelligenceLane
  sourceUrl: string
  observedAt: string
  changedFields: string[]
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface OwnedPageContext {
  pageId: string
  canonicalUrl: string
  visitors: number
  sessions: number
  engagementRate: number
  leadActions: number
  confirmedLeads: number
  confirmedLeadRate: number
}

export interface SiteIntelligenceCampaignMessage {
  id: string
  landingPageUrl: string
  model?: string | null
  offerTypes?: string[]
  ctas?: string[]
}

export interface OfferGapResult {
  key: string
  status: 'gap' | 'matched' | 'insufficient_data'
  comparisonLevel: 'exact_model' | 'category' | 'none'
  ownedPageId: string | null
  competitorPageIds: string[]
  evidenceUrls: string[]
  observedAt: string
  confidence: number
  explanation: string
}

export interface DeriveSiteIntelligenceInput {
  clientId: string
  pages: SiteIntelligenceCandidatePage[]
  changes?: SiteIntelligenceCandidateChange[]
  audienceContext?: OwnedPageContext[]
  campaignMessages?: SiteIntelligenceCampaignMessage[]
  now?: Date
}

const OFFER_CHANGE_FIELDS = new Set([
  'driveAwayPrice',
  'listPrice',
  'discount',
  'offerTypes',
  'finance.deposit',
  'finance.repayment',
  'finance.comparisonRate',
  'finance.termMonths',
  'finance.balloon',
  'expiry',
  'ctas',
  'stockState'
])

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return result || null
}

function currentDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function hasOfferFacts(facts: Partial<AutomotivePageFacts>): boolean {
  const finance = facts.finance
  return Boolean(
    facts.offerTypes?.length
    || facts.driveAwayPrice != null
    || facts.listPrice != null
    || facts.discount != null
    || finance?.deposit != null
    || finance?.repayment != null
    || finance?.comparisonRate != null
  )
}

function hasCurrentOffer(page: SiteIntelligenceCandidatePage, now: Date): boolean {
  if (!hasOfferFacts(page.facts)) return false
  return !page.facts.expiry || page.facts.expiry >= currentDate(now)
}

function isExpired(page: SiteIntelligenceCandidatePage, now: Date): boolean {
  return Boolean(page.facts.expiry && page.facts.expiry < currentDate(now))
}

function exactModel(a: SiteIntelligenceCandidatePage, b: SiteIntelligenceCandidatePage): boolean {
  const aModel = normalized(a.facts.model)
  const bModel = normalized(b.facts.model)
  if (!aModel || !bModel || aModel !== bModel) return false
  const aBrand = normalized(a.facts.brand)
  const bBrand = normalized(b.facts.brand)
  return !aBrand || !bBrand || aBrand === bBrand
}

function sameCategory(a: SiteIntelligenceCandidatePage, b: SiteIntelligenceCandidatePage): boolean {
  const aCategory = normalized(a.facts.bodyType)
  const bCategory = normalized(b.facts.bodyType)
  return Boolean(aCategory && bCategory && aCategory === bCategory)
}

function latestObservedAt(pages: SiteIntelligenceCandidatePage[]): string {
  return pages.map(page => page.observedAt).sort().at(-1) ?? new Date(0).toISOString()
}

export function compareAutomotiveOffers(
  ownedFacts: SiteIntelligenceCandidatePage[],
  competitorFacts: SiteIntelligenceCandidatePage[],
  now = new Date()
): OfferGapResult[] {
  return competitorFacts
    .filter(page => hasCurrentOffer(page, now))
    .map((competitor) => {
      const exact = ownedFacts.filter(owned => exactModel(owned, competitor))
      const category = exact.length ? [] : ownedFacts.filter(owned => sameCategory(owned, competitor))
      const comparable = exact.length ? exact : category
      const comparisonLevel = exact.length ? 'exact_model' : category.length ? 'category' : 'none'
      const label = competitor.facts.model || competitor.facts.bodyType || 'competitor offer'

      if (!normalized(competitor.facts.model) && !normalized(competitor.facts.bodyType)) {
        return {
          key: `offer:${competitor.id}:insufficient`,
          status: 'insufficient_data' as const,
          comparisonLevel: 'none' as const,
          ownedPageId: null,
          competitorPageIds: [competitor.id],
          evidenceUrls: [competitor.sourceUrl],
          observedAt: competitor.observedAt,
          confidence: 0,
          explanation: 'insufficient_data: no reliable model or category fact is available.'
        }
      }

      if (!comparable.length) {
        return {
          key: `offer:${competitor.id}:insufficient`,
          status: 'insufficient_data' as const,
          comparisonLevel: 'none' as const,
          ownedPageId: null,
          competitorPageIds: [competitor.id],
          evidenceUrls: [competitor.sourceUrl],
          observedAt: competitor.observedAt,
          confidence: 0,
          explanation: `insufficient_data: no approved owned ${label} comparison page is available.`
        }
      }

      const ownedWithOffer = comparable.find(owned => hasCurrentOffer(owned, now))
      const owned = ownedWithOffer ?? comparable[0]!
      const status = ownedWithOffer ? 'matched' : 'gap'
      return {
        key: `offer:${comparisonLevel}:${owned.id}:${competitor.id}`,
        status,
        comparisonLevel,
        ownedPageId: owned.id,
        competitorPageIds: [competitor.id],
        evidenceUrls: [owned.sourceUrl, competitor.sourceUrl],
        observedAt: latestObservedAt([owned, competitor]),
        confidence: comparisonLevel === 'exact_model' ? 0.95 : 0.7,
        explanation: status === 'gap'
          ? `A current competitor ${label} offer has no comparable current owned-site offer fact.`
          : `Both sites contain a current ${label} offer fact.`
      }
    })
}

export function joinOwnedAudienceContext(
  pageUrls: Array<{ pageId: string, canonicalUrl: string }>,
  audienceBreakdowns: AudienceBreakdownRow[]
): OwnedPageContext[] {
  const breakdowns = new Map(
    audienceBreakdowns
      .map(row => [canonicalUrl(row.key), row] as const)
      .filter((entry): entry is [string, AudienceBreakdownRow] => entry[0] !== null)
  )

  return pageUrls.flatMap((page) => {
    const url = canonicalUrl(page.canonicalUrl)
    const row = url ? breakdowns.get(url) : undefined
    if (!url || !row) return []
    return [{
      pageId: page.pageId,
      canonicalUrl: url,
      visitors: row.visitors,
      sessions: row.sessions,
      engagementRate: row.engagementRate,
      leadActions: row.leadActions,
      confirmedLeads: row.confirmedLeads,
      confirmedLeadRate: row.confirmedLeadRate
    }]
  })
}

function makeInsight(input: {
  clientId: string
  type: SiteIntelligenceInsight['type']
  lane: SiteIntelligenceInsight['lane']
  title: string
  summary: string
  confidence: number
  pages: SiteIntelligenceCandidatePage[]
  changeIds?: string[]
  now: Date
}): SiteIntelligenceInsight {
  const pageIds = Array.from(new Set(input.pages.map(page => page.id))).sort()
  const changeIds = Array.from(new Set(input.changeIds ?? [])).sort()
  return {
    id: `${SITE_INTELLIGENCE_RULE_VERSION}:${input.type}:${[...pageIds, ...changeIds].join(':')}`,
    clientId: input.clientId,
    type: input.type,
    lane: input.lane,
    title: input.title,
    summary: input.summary,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    deterministic: true,
    ruleVersion: SITE_INTELLIGENCE_RULE_VERSION,
    evidencePageIds: pageIds,
    evidenceChangeIds: changeIds,
    evidenceUrls: Array.from(new Set(input.pages.map(page => page.sourceUrl))).sort(),
    status: 'open',
    observedAt: latestObservedAt(input.pages),
    generatedAt: input.now.toISOString(),
    assignedTo: null,
    taskId: null
  }
}

function pageTypeLabel(pageType: SiteIntelligencePageType | undefined): string {
  return pageType?.replace(/_/g, ' ') ?? 'content'
}

function hasMeaningfulChangedValue(values: Record<string, unknown> | undefined, fields: string[]): boolean {
  if (!values) return false
  return fields.some((field) => {
    const value = values[field]
    return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)
  })
}

export function deriveSiteIntelligenceInsights(input: DeriveSiteIntelligenceInput): SiteIntelligenceInsight[] {
  const now = input.now ?? new Date()
  const owned = input.pages.filter(page => page.clientId === input.clientId && page.lane === 'owned')
  const competitors = input.pages.filter(page => page.clientId === input.clientId && page.lane === 'competitor')
  const byId = new Map(input.pages.map(page => [page.id, page]))
  const insights: SiteIntelligenceInsight[] = []

  for (const change of input.changes ?? []) {
    const page = byId.get(change.pageId)
    const relevant = change.changedFields.filter(field => OFFER_CHANGE_FIELDS.has(field))
    if (!page || !relevant.length) continue
    const beforeHasOffer = hasMeaningfulChangedValue(change.before, relevant)
    const afterHasOffer = hasMeaningfulChangedValue(change.after, relevant)
    const action = !beforeHasOffer && afterHasOffer
      ? 'introduced'
      : beforeHasOffer && !afterHasOffer
        ? 'removed'
        : 'changed'
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'offer_change',
      lane: change.lane,
      title: `${change.lane === 'competitor' ? 'Competitor' : 'Owned'} offer ${action}`,
      summary: `Material offer fields ${action}: ${relevant.join(', ')}.`,
      confidence: 1,
      pages: [page],
      changeIds: [change.id],
      now
    }))
  }

  for (const gap of compareAutomotiveOffers(owned, competitors, now).filter(item => item.status === 'gap')) {
    const pages = [gap.ownedPageId, ...gap.competitorPageIds]
      .flatMap(id => id ? [byId.get(id)] : [])
      .filter((page): page is SiteIntelligenceCandidatePage => Boolean(page))
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'offer_gap',
      lane: 'cross_lane',
      title: 'Current competitor offer gap',
      summary: gap.explanation,
      confidence: gap.confidence,
      pages,
      now
    }))
  }

  for (const message of input.campaignMessages ?? []) {
    const landingUrl = canonicalUrl(message.landingPageUrl)
    const page = owned.find(candidate => canonicalUrl(candidate.canonicalUrl) === landingUrl)
    if (!page) continue
    const modelMismatch = Boolean(message.model && normalized(message.model) !== normalized(page.facts.model))
    const offerMismatch = Boolean(message.offerTypes?.some(type => !page.facts.offerTypes?.includes(type)))
    const ctaMismatch = Boolean(message.ctas?.some(cta => !page.facts.ctas?.includes(cta)))
    if (!modelMismatch && !offerMismatch && !ctaMismatch) continue
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'landing_mismatch',
      lane: 'owned',
      title: 'Paid landing message mismatch',
      summary: 'Current landing-page model, offer, or CTA facts do not fully support the linked campaign message.',
      confidence: 0.9,
      pages: [page],
      now
    }))
  }

  const audienceByPage = new Map((input.audienceContext ?? []).map(context => [context.pageId, context]))
  for (const page of owned) {
    const audience = audienceByPage.get(page.id)
    if (!audience || audience.sessions < 20 || !isExpired(page, now)) continue
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'high_traffic_stale_content',
      lane: 'owned',
      title: 'Active owned page has stale offer content',
      summary: 'This owned page has meaningful aggregate activity while its structured offer expiry is in the past.',
      confidence: 0.95,
      pages: [page],
      now
    }))
  }

  for (const competitor of competitors) {
    const pageType = competitor.facts.pageType
    if (!pageType || !['model', 'finance', 'service'].includes(pageType)) continue
    const ownedMatch = pageType === 'model'
      ? owned.some(page => page.facts.pageType === 'model' && exactModel(page, competitor))
      : owned.some(page => page.facts.pageType === pageType)
    if (ownedMatch) continue
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'content_gap',
      lane: 'cross_lane',
      title: `${pageTypeLabel(pageType)} content gap`,
      summary: `Approved competitor evidence contains ${pageTypeLabel(pageType)} content that has no conservative owned-site match.`,
      confidence: pageType === 'model' ? 0.85 : 0.75,
      pages: [competitor],
      now
    }))
  }

  for (const page of owned) {
    const audience = audienceByPage.get(page.id)
    if (!audience || audience.sessions < 20 || audience.confirmedLeadRate >= 2) continue
    const competitor = competitors.find(candidate => exactModel(candidate, page)
      && ((candidate.facts.ctas?.length ?? 0) > (page.facts.ctas?.length ?? 0) || hasCurrentOffer(candidate, now)))
    if (!competitor) continue
    insights.push(makeInsight({
      clientId: input.clientId,
      type: 'conversion_context',
      lane: 'cross_lane',
      title: 'Owned conversion-context opportunity',
      summary: 'Owned aggregate page outcomes are weak enough to review, while approved competitor content shows clearer CTA or current-offer facts.',
      confidence: 0.8,
      pages: [page, competitor],
      now
    }))
  }

  return Array.from(new Map(insights.map(insight => [insight.id, insight])).values())
    .sort((a, b) => b.confidence - a.confidence || b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id))
}
