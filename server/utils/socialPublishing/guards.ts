import { createError, type H3Event } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { classifySocialPublishingAccountHealth } from '~~/server/utils/socialPublishing/accountHealth'
import {
  SUPPORTED_SOCIAL_PUBLISH_PLATFORMS,
  assertProductionReadyPublishPlatforms
} from '~~/server/utils/socialPublishing/platformReadiness'

const PLATFORM_SET = new Set<string>(SUPPORTED_SOCIAL_PUBLISH_PLATFORMS)
const PLATFORM_OVERRIDE_FIELDS = new Set(['content', 'mediaUrls', 'options'])
const INSTAGRAM_TYPES = new Set(['post', 'reel', 'story'])
const GBP_TOPIC_TYPES = new Set(['STANDARD', 'OFFER', 'EVENT'])
const GBP_CTA_ACTIONS = new Set(['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'])
const YOUTUBE_PRIVACY_STATUSES = new Set(['public', 'private', 'unlisted'])
const MAX_MEDIA_URLS = 10
const MAX_OVERRIDE_PLATFORMS = SUPPORTED_SOCIAL_PUBLISH_PLATFORMS.length
const MAX_OVERRIDE_CONTENT_LENGTH = 10_000
const MAX_OPTION_STRING_LENGTH = 500
const MAX_YOUTUBE_TAGS = 30
const MAX_INSTAGRAM_COLLABORATORS = 20

const CONTROLLED_SOCIAL_POST_FIELDS = new Set([
  'status',
  'approvalRequestedAt',
  'approvalRequestedBy',
  'approvedAt',
  'approvedBy',
  'rejectionReason',
  'approval_requested_at',
  'approval_requested_by',
  'approved_at',
  'approved_by',
  'rejection_reason'
])

export interface SocialPostClientRef {
  id: string
  client_id: string
  platforms?: string[] | null
  account_ids?: string[] | null
  status?: string | null
  approval_requested_at?: string | null
  client_approval_status?: string | null
  metadata?: Record<string, any> | null
}

export interface NormalizedPublishingTarget {
  platform: string
  accountId: string
  options?: Record<string, unknown>
}

export interface NormalizedPublishingTargets {
  targets: NormalizedPublishingTarget[]
  platforms: string[]
  accountIds: string[]
}

interface PublishingAccountValidationRow {
  id: string
  platform: string
  is_active?: boolean
  last_error?: string | null
  token_expires_at?: string | null
  has_refresh_token?: boolean
  metadata?: Record<string, unknown> | string | null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

export function normalizePublishPlatforms(value: unknown): string[] {
  const platforms = normalizeStringArray(value)
  for (const platform of platforms) {
    if (!PLATFORM_SET.has(platform)) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported platform: ${platform}` })
    }
  }
  return platforms
}

export function normalizeProductionReadyPublishPlatforms(value: unknown): string[] {
  const platforms = normalizePublishPlatforms(value)
  assertProductionReadyPublishPlatforms(platforms)
  return platforms
}

export function normalizePublishingAccountIds(value: unknown): string[] {
  return normalizeStringArray(value)
}

export function normalizeScheduledAt(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be a valid ISO datetime' })
  }
  const time = Date.parse(value)
  if (!Number.isFinite(time) || !value.includes('T')) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledAt must be a valid ISO datetime' })
  }
  return new Date(time).toISOString()
}

export function normalizeMediaUrls(value: unknown): string[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'mediaUrls must be an array' })
  }
  if (value.length > MAX_MEDIA_URLS) {
    throw createError({ statusCode: 400, statusMessage: `mediaUrls can contain at most ${MAX_MEDIA_URLS} items` })
  }

  const urls: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid media URL' })
    }
    const url = item.trim()
    if (!url) continue
    if (!isAllowedMediaUrl(url)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid media URL' })
    }
    if (!seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  return urls.length ? urls : null
}

export function normalizePlatformOverrides(value: unknown): Record<string, { content?: string, mediaUrls?: string[], options?: Record<string, unknown> }> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'platformOverrides must be an object' })
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_OVERRIDE_PLATFORMS) {
    throw createError({ statusCode: 400, statusMessage: `platformOverrides can contain at most ${MAX_OVERRIDE_PLATFORMS} platforms` })
  }

  const out: Record<string, { content?: string, mediaUrls?: string[], options?: Record<string, unknown> }> = {}
  for (const [platform, rawOverride] of entries) {
    if (!PLATFORM_SET.has(platform)) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported platform override: ${platform}` })
    }
    if (rawOverride == null) continue
    if (typeof rawOverride !== 'object' || Array.isArray(rawOverride)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid platform override for ${platform}` })
    }
    const override = rawOverride as Record<string, unknown>
    for (const key of Object.keys(override)) {
      if (!PLATFORM_OVERRIDE_FIELDS.has(key)) {
        throw createError({ statusCode: 400, statusMessage: `Unsupported platform override field: ${key}` })
      }
    }

    const normalized: { content?: string, mediaUrls?: string[], options?: Record<string, unknown> } = {}
    if ('content' in override) {
      if (typeof override.content !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `Invalid platform override content for ${platform}` })
      }
      const content = override.content.trim()
      if (content.length > MAX_OVERRIDE_CONTENT_LENGTH) {
        throw createError({ statusCode: 400, statusMessage: `Platform override content is too long for ${platform}` })
      }
      if (content) normalized.content = content
    }
    if ('mediaUrls' in override) {
      const mediaUrls = normalizeMediaUrls(override.mediaUrls)
      if (mediaUrls?.length) normalized.mediaUrls = mediaUrls
    }
    if ('options' in override) {
      const options = normalizeProviderOptions(platform, override.options)
      if (Object.keys(options).length) normalized.options = options
    }
    if (Object.keys(normalized).length) out[platform] = normalized
  }
  return out
}

export function normalizeSocialPostPayloadFields(body: Record<string, unknown>) {
  if ('scheduledAt' in body) body.scheduledAt = normalizeScheduledAt(body.scheduledAt)
  if ('mediaUrls' in body) body.mediaUrls = normalizeMediaUrls(body.mediaUrls)
  if ('platformOverrides' in body) body.platformOverrides = normalizePlatformOverrides(body.platformOverrides)
}

export function assertNoControlledSocialPostFields(body: Record<string, unknown>) {
  const fields = Object.keys(body).filter(key => CONTROLLED_SOCIAL_POST_FIELDS.has(key))
  if (fields.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot update controlled social post fields: ${fields.join(', ')}`
    })
  }
}

export async function requireSocialPostClientAccess(event: H3Event, postId: string): Promise<SocialPostClientRef> {
  const row = await queryOne<SocialPostClientRef>(
    `SELECT id, client_id, platforms, account_ids, status, approval_requested_at,
            client_approval_status, metadata
       FROM social_posts WHERE id = $1`,
    [postId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await requireSocialClientAccess(event, row.client_id)
  return row
}

export async function assertPublishingTargets(
  clientId: string,
  platforms: string[],
  accountIdsInput: unknown
) {
  const accountIds = normalizePublishingAccountIds(accountIdsInput)
  if (!accountIds.length) return accountIds

  const rows = await queryRows<PublishingAccountValidationRow>(
    `SELECT id, platform, is_active, last_error, token_expires_at, metadata,
            (NULLIF(refresh_token, '') IS NOT NULL) AS has_refresh_token
       FROM social_accounts
      WHERE id = ANY($1)
        AND client_id = $2`,
    [accountIds, clientId]
  )
  const byId = new Map(rows.map(row => [row.id, row]))
  const selectedPlatforms = new Set(platforms)

  for (const accountId of accountIds) {
    const account = byId.get(accountId)
    if (!account || !selectedPlatforms.has(account.platform)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid publishing account' })
    }
    assertPublishingAccountUsable(account)
  }

  return accountIds
}

export async function normalizePublishingTargets(
  clientId: string,
  value: unknown
): Promise<NormalizedPublishingTargets | null> {
  if (value == null) return null
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'targets must be an array' })
  }
  if (value.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'targets can contain at most 50 items' })
  }

  const targets: NormalizedPublishingTarget[] = []
  const accountIds: string[] = []
  const seenTargets = new Set<string>()

  for (const rawTarget of value) {
    if (typeof rawTarget !== 'object' || rawTarget == null || Array.isArray(rawTarget)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid publishing target' })
    }
    const target = rawTarget as Record<string, unknown>
    assertOptionFields('target', target, new Set(['platform', 'accountId', 'options']))
    if (typeof target.platform !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid publishing target platform' })
    }
    if (typeof target.accountId !== 'string' || !target.accountId.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid publishing target accountId' })
    }
    const platform = normalizePublishPlatforms([target.platform])[0]!
    assertProductionReadyPublishPlatforms([platform])
    const accountId = target.accountId.trim()
    const key = `${platform}:${accountId}`
    if (seenTargets.has(key)) {
      throw createError({ statusCode: 400, statusMessage: 'Duplicate publishing target' })
    }
    seenTargets.add(key)
    accountIds.push(accountId)

    const options = 'options' in target ? normalizeProviderOptions(platform, target.options) : {}
    targets.push(Object.keys(options).length
      ? { platform, accountId, options }
      : { platform, accountId })
  }

  const rows = await queryRows<PublishingAccountValidationRow>(
    `SELECT id, platform, is_active, last_error, token_expires_at, metadata,
            (NULLIF(refresh_token, '') IS NOT NULL) AS has_refresh_token
       FROM social_accounts
      WHERE id = ANY($1)
        AND client_id = $2`,
    [accountIds, clientId]
  )
  const byId = new Map(rows.map(row => [row.id, row]))
  for (const target of targets) {
    const account = byId.get(target.accountId)
    if (!account || account.platform !== target.platform) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid publishing target' })
    }
    assertPublishingAccountUsable(account)
  }

  return {
    targets,
    platforms: Array.from(new Set(targets.map(target => target.platform))),
    accountIds: Array.from(new Set(targets.map(target => target.accountId)))
  }
}

function parseAccountMetadata(value: PublishingAccountValidationRow['metadata']): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return value
}

function assertPublishingAccountUsable(account: PublishingAccountValidationRow): void {
  const isActive = account.is_active !== false
  if (!isActive) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid publishing account' })
  }

  const health = classifySocialPublishingAccountHealth({
    platform: account.platform,
    isActive,
    lastError: account.last_error,
    tokenExpiresAt: account.token_expires_at,
    hasRefreshToken: account.has_refresh_token,
    metadata: parseAccountMetadata(account.metadata)
  })

  if (health.requiresReconnect || health.health === 'reconnect') {
    throw createError({ statusCode: 400, statusMessage: 'Publishing account requires reconnect' })
  }
}

function isAllowedMediaUrl(value: string): boolean {
  if (value.startsWith('/api/public/renders/') || value.startsWith('/api/public/video-assets/')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function normalizeProviderOptions(platform: string, value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid provider options for ${platform}` })
  }
  const options = value as Record<string, unknown>
  if (Object.keys(options).length === 0) return {}
  if (platform === 'instagram') return normalizeInstagramOptions(options)
  if (platform === 'google-business') return normalizeGoogleBusinessOptions(options)
  if (platform === 'youtube') return normalizeYouTubeOptions(options)
  throw createError({ statusCode: 400, statusMessage: `Provider options are not supported for ${platform}` })
}

function normalizeInstagramOptions(options: Record<string, unknown>): Record<string, unknown> {
  assertOptionFields('Instagram', options, new Set(['type', 'collaborators']))
  const out: Record<string, unknown> = {}

  if ('type' in options) {
    if (typeof options.type !== 'string' || !INSTAGRAM_TYPES.has(options.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Instagram type' })
    }
    out.type = options.type
  }

  if ('collaborators' in options) {
    out.collaborators = normalizeStringList(
      options.collaborators,
      'Instagram collaborators',
      MAX_INSTAGRAM_COLLABORATORS,
      100
    )
  }

  return out
}

function normalizeGoogleBusinessOptions(options: Record<string, unknown>): Record<string, unknown> {
  assertOptionFields('Google Business', options, new Set(['topicType', 'callToAction', 'event', 'offer', 'languageCode']))
  const out: Record<string, unknown> = {}

  if ('topicType' in options) {
    if (typeof options.topicType !== 'string' || !GBP_TOPIC_TYPES.has(options.topicType)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business topicType' })
    }
    out.topicType = options.topicType
  }

  if ('callToAction' in options) {
    out.callToAction = normalizeGoogleBusinessCallToAction(options.callToAction)
  }
  if ('event' in options) {
    out.event = normalizeGoogleBusinessEvent(options.event)
  }
  if ('offer' in options) {
    out.offer = normalizeGoogleBusinessOffer(options.offer)
  }
  if ('languageCode' in options) {
    out.languageCode = normalizeBoundedString(options.languageCode, 'Google Business languageCode', 12)
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(out.languageCode as string)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business languageCode' })
    }
  }

  const topicType = out.topicType
  if ((topicType === 'EVENT' || topicType === 'OFFER') && !out.event) {
    throw createError({ statusCode: 400, statusMessage: 'Google Business event is required for EVENT and OFFER posts' })
  }

  return out
}

function normalizeGoogleBusinessCallToAction(value: unknown) {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business callToAction' })
  }
  const raw = value as Record<string, unknown>
  assertOptionFields('Google Business callToAction', raw, new Set(['actionType', 'url']))
  if (typeof raw.actionType !== 'string' || !GBP_CTA_ACTIONS.has(raw.actionType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business callToAction actionType' })
  }
  return {
    actionType: raw.actionType,
    url: normalizeHttpUrl(raw.url, 'Google Business callToAction url')
  }
}

function normalizeGoogleBusinessEvent(value: unknown) {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business event' })
  }
  const raw = value as Record<string, unknown>
  assertOptionFields('Google Business event', raw, new Set(['title', 'startDate', 'endDate', 'startTime', 'endTime']))
  const out: Record<string, unknown> = {
    title: normalizeBoundedString(raw.title, 'Google Business event title', 200),
    startDate: normalizeDateString(raw.startDate, 'Google Business event startDate'),
    endDate: normalizeDateString(raw.endDate, 'Google Business event endDate')
  }
  if ('startTime' in raw) out.startTime = normalizeTimeString(raw.startTime, 'Google Business event startTime')
  if ('endTime' in raw) out.endTime = normalizeTimeString(raw.endTime, 'Google Business event endTime')
  return out
}

function normalizeGoogleBusinessOffer(value: unknown) {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google Business offer' })
  }
  const raw = value as Record<string, unknown>
  assertOptionFields('Google Business offer', raw, new Set(['couponCode', 'redeemOnlineUrl', 'termsConditions']))
  const out: Record<string, unknown> = {}
  if ('couponCode' in raw) out.couponCode = normalizeBoundedString(raw.couponCode, 'Google Business offer couponCode', 80)
  if ('redeemOnlineUrl' in raw) out.redeemOnlineUrl = normalizeHttpUrl(raw.redeemOnlineUrl, 'Google Business offer redeemOnlineUrl')
  if ('termsConditions' in raw) out.termsConditions = normalizeBoundedString(raw.termsConditions, 'Google Business offer termsConditions', MAX_OPTION_STRING_LENGTH)
  return out
}

function normalizeYouTubeOptions(options: Record<string, unknown>): Record<string, unknown> {
  assertOptionFields('YouTube', options, new Set(['title', 'tags', 'privacyStatus', 'isShort', 'madeForKids', 'categoryId', 'playlistId']))
  const out: Record<string, unknown> = {}

  if ('title' in options) out.title = normalizeBoundedString(options.title, 'YouTube title', 100)
  if ('tags' in options) out.tags = normalizeStringList(options.tags, 'YouTube tags', MAX_YOUTUBE_TAGS, 100)
  if ('privacyStatus' in options) {
    if (typeof options.privacyStatus !== 'string' || !YOUTUBE_PRIVACY_STATUSES.has(options.privacyStatus)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid YouTube privacyStatus' })
    }
    out.privacyStatus = options.privacyStatus
  }
  if ('isShort' in options) out.isShort = normalizeBoolean(options.isShort, 'YouTube isShort')
  if ('madeForKids' in options) out.madeForKids = normalizeBoolean(options.madeForKids, 'YouTube madeForKids')
  if ('categoryId' in options) {
    const categoryId = normalizeBoundedString(options.categoryId, 'YouTube categoryId', 32)
    if (!/^\d+$/.test(categoryId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid YouTube categoryId' })
    }
    out.categoryId = categoryId
  }
  if ('playlistId' in options) out.playlistId = normalizeBoundedString(options.playlistId, 'YouTube playlistId', 128)

  return out
}

function assertOptionFields(label: string, options: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported ${label} option field: ${key}` })
    }
  }
}

function normalizeBoundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  const text = value.trim()
  if (!text || text.length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  return text
}

function normalizeStringList(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  if (value.length > maxItems) {
    throw createError({ statusCode: 400, statusMessage: `${label} can contain at most ${maxItems} items` })
  }
  return value.map(item => normalizeBoundedString(item, label, maxLength))
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  return value
}

function normalizeHttpUrl(value: unknown, label: string): string {
  const url = normalizeBoundedString(value, label, 2_000)
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    return url
  } catch {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
}

function normalizeDateString(value: unknown, label: string): string {
  const text = normalizeBoundedString(value, label, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  return text
}

function normalizeTimeString(value: unknown, label: string): string {
  const text = normalizeBoundedString(value, label, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  return text
}
