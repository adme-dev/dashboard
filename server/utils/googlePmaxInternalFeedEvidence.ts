import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import type {
  FeedDetail,
  FeedPlatform,
  FeedPreviewResult,
  FeedRef,
  FeedSummary
} from '~~/server/utils/feeds/types'
import type { GooglePmaxPreflightEvidence } from '~~/server/utils/googlePmaxPreflight'

export interface GooglePmaxBoundInventoryConfig {
  clientId: string
  inventorySource: {
    providerId: 'social-dashboard'
    linkId: string
    feedId: string
    platform: 'google'
  }
}

export interface GooglePmaxEvidenceDealerLink {
  id: string
  clientId: string
  providerId: string
  externalOrgId: string
  sellerRefs: string[]
  defaultFeedIds: string[]
}

interface GooglePmaxInternalFeedEvidenceDependencies {
  getActiveLink: (clientId: string, providerId: string) => Promise<GooglePmaxEvidenceDealerLink | null>
  listFeeds: (link: GooglePmaxEvidenceDealerLink) => Promise<FeedSummary[]>
  getFeed: (ref: FeedRef) => Promise<FeedDetail>
  previewFeed: (
    link: GooglePmaxEvidenceDealerLink,
    ref: FeedRef,
    options: { limit: number, offset: number }
  ) => Promise<FeedPreviewResult>
  resolveConditions: (
    detail: FeedDetail,
    preview: FeedPreviewResult
  ) => Array<'NEW' | 'USED'>
  now?: () => Date
}

type InternalFeedEvidence = GooglePmaxPreflightEvidence['internalFeed']

export class GooglePmaxInternalFeedEvidenceError extends Error {
  constructor(public readonly code: 'PMAX_FEED_LINK_NOT_FOUND' | 'PMAX_FEED_LINK_IDENTITY_MISMATCH' | 'PMAX_FEED_NOT_FOUND' | 'PMAX_FEED_IDENTITY_MISMATCH') {
    super('Client-owned Google feed evidence could not be resolved.')
    this.name = 'GooglePmaxInternalFeedEvidenceError'
  }
}

function uniqueConditions(values: Array<'NEW' | 'USED'>): Array<'NEW' | 'USED'> {
  return [...new Set(values)].sort()
}

function recognizedCondition(value: unknown): 'NEW' | 'USED' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'new') return 'NEW'
  if (['used', 'preowned', 'pre_owned', 'certified_preowned', 'certified_pre_owned'].includes(normalized)) return 'USED'
  return null
}

function normalizedConditionKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function collectRawValues(value: unknown, output: string[]): void {
  if (typeof value === 'string' && value.trim()) output.push(normalizedConditionKey(value))
  if (Array.isArray(value)) {
    value.forEach(item => collectRawValues(item, output))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(nested => collectRawValues(nested, output))
  }
}

function findConditionFields(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach(item => findConditionFields(item, output))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (['condition', 'conditions', 'inventorycondition', 'listingtype', 'listingtypes', 'stocktype', 'stocktypes'].includes(normalizedKey)) {
      collectRawValues(nested, output)
    } else {
      findConditionFields(nested, output)
    }
  }
}

function collectMappingPairs(value: unknown, output: Map<string, 'NEW' | 'USED'>): void {
  if (Array.isArray(value)) {
    value.forEach(item => collectMappingPairs(item, output))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    const target = recognizedCondition(nested)
    if (target) output.set(normalizedConditionKey(key), target)
    else collectMappingPairs(nested, output)
  }
}

export function resolveGoogleFeedConditionsFromProviderEvidence(
  detail: FeedDetail,
  preview: FeedPreviewResult
): Array<'NEW' | 'USED'> {
  const rawValues: string[] = []
  findConditionFields(detail.filters, rawValues)
  for (const item of preview.items) {
    if (item.condition) rawValues.push(normalizedConditionKey(item.condition))
  }
  const mappings = new Map<string, 'NEW' | 'USED'>()
  collectMappingPairs(detail.mappings, mappings)
  const conditions: Array<'NEW' | 'USED'> = []
  for (const raw of rawValues) {
    const condition = recognizedCondition(raw) || mappings.get(raw)
    if (condition) conditions.push(condition)
  }
  return uniqueConditions(conditions)
}

function unavailableFeed(
  linkId: string,
  feedId: string,
  platform: FeedPlatform,
  fetchedAt: string
): InternalFeedEvidence {
  return {
    linkId,
    feedId,
    platform,
    status: 'blocked',
    matchedItemCount: 0,
    validatedItemCount: 0,
    invalidItemCount: 0,
    conditions: [],
    fetchedAt
  }
}

export function createGooglePmaxInternalFeedEvidenceReader(
  dependencies: GooglePmaxInternalFeedEvidenceDependencies
) {
  const now = dependencies.now || (() => new Date())
  return {
    async read(config: GooglePmaxBoundInventoryConfig): Promise<InternalFeedEvidence> {
      const link = await dependencies.getActiveLink(config.clientId, config.inventorySource.providerId)
      const feeds = link ? await dependencies.listFeeds(link) : []
      const feed = feeds.find(item => item.id === config.inventorySource.feedId)
      const fetchedAt = now().toISOString()
      let detail: FeedDetail | null = null
      let preview: FeedPreviewResult | null = null
      let conditions: Array<'NEW' | 'USED'> | undefined
      if (link && feed?.isActive && feed.platform === 'google') {
        const ref: FeedRef = { providerId: config.inventorySource.providerId, feedId: feed.id, platform: feed.platform }
        detail = await dependencies.getFeed(ref)
        if (detail.id === feed.id && detail.platform === feed.platform && detail.isActive) {
          preview = await dependencies.previewFeed(link, ref, { limit: 100, offset: 0 })
          conditions = dependencies.resolveConditions(detail, preview)
        }
      }
      return evaluateGooglePmaxInternalFeedEvidence({
        config, link, feeds, detail, preview, fetchedAt, conditions
      })
    }
  }
}

export function evaluateGooglePmaxInternalFeedEvidence(input: {
  config: GooglePmaxBoundInventoryConfig
  link: GooglePmaxEvidenceDealerLink | null
  feeds: FeedSummary[]
  detail: FeedDetail | null
  preview: FeedPreviewResult | null
  fetchedAt: string
  conditions?: Array<'NEW' | 'USED'>
}): InternalFeedEvidence {
  const { config, link } = input
  if (!link) throw new GooglePmaxInternalFeedEvidenceError('PMAX_FEED_LINK_NOT_FOUND')
  if (
    link.id.toLowerCase() !== config.inventorySource.linkId.toLowerCase()
    || link.clientId.toLowerCase() !== config.clientId.toLowerCase()
    || link.providerId !== config.inventorySource.providerId
  ) throw new GooglePmaxInternalFeedEvidenceError('PMAX_FEED_LINK_IDENTITY_MISMATCH')
  const feed = input.feeds.find(item => item.id === config.inventorySource.feedId)
  if (!feed) throw new GooglePmaxInternalFeedEvidenceError('PMAX_FEED_NOT_FOUND')
  if (!feed.isActive || feed.platform !== 'google') return unavailableFeed(link.id, feed.id, feed.platform, input.fetchedAt)
  if (!input.detail || input.detail.id !== feed.id || input.detail.platform !== feed.platform) {
    throw new GooglePmaxInternalFeedEvidenceError('PMAX_FEED_IDENTITY_MISMATCH')
  }
  if (!input.detail.isActive) return unavailableFeed(link.id, feed.id, feed.platform, input.fetchedAt)
  if (!input.preview) throw new GooglePmaxInternalFeedEvidenceError('PMAX_FEED_IDENTITY_MISMATCH')
  const readiness = summarizeFeedReadiness(input.preview.validation)
  const conditions = uniqueConditions(
    input.conditions || resolveGoogleFeedConditionsFromProviderEvidence(input.detail, input.preview)
  )
  return {
    linkId: link.id,
    feedId: feed.id,
    platform: feed.platform,
    status: readiness.status === 'ready' && conditions.length === 0 ? 'unknown' : readiness.status,
    matchedItemCount: readiness.matchedTotal,
    validatedItemCount: readiness.validatedTotal,
    invalidItemCount: readiness.invalidTotal,
    conditions,
    fetchedAt: input.fetchedAt
  }
}
