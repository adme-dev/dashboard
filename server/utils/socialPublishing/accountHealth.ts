import { socialPublishingPlatformProductionStatus } from './platformReadiness'

export type SocialPublishingAccountHealth = 'healthy' | 'attention' | 'reconnect' | 'disconnected'

export interface SocialPublishingAccountHealthInput {
  platform: string
  isActive: boolean
  lastError?: string | null
  tokenExpiresAt?: string | Date | null
  hasRefreshToken?: boolean | null
  metadata?: Record<string, unknown> | null
  linkedFacebookAccountId?: string | null
  linkedFacebookIsActive?: boolean | null
  now?: Date
}

export interface SocialPublishingAccountHealthResult {
  health: SocialPublishingAccountHealth
  healthLabel: string
  healthReason: string | null
  requiresReconnect: boolean
  daysUntilExpiry: number | null
}

const RECONNECT_ERROR_PATTERN = /\b(token|oauth|auth|permission|expired|invalid|revoked)\b/i
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null
  return Math.floor((date.getTime() - now.getTime()) / ONE_DAY_MS)
}

function isWebhookUnsubscribed(input: SocialPublishingAccountHealthInput): boolean {
  if (!['facebook', 'instagram'].includes(input.platform)) return false
  return input.metadata?.webhook_subscribed === false
}

export function classifySocialPublishingAccountHealth(
  input: SocialPublishingAccountHealthInput
): SocialPublishingAccountHealthResult {
  const now = input.now ?? new Date()
  const tokenExpiresAt = toDate(input.tokenExpiresAt)
  const days = daysUntil(tokenExpiresAt, now)
  const hasRefreshToken = Boolean(input.hasRefreshToken)

  if (!input.isActive) {
    return {
      health: 'disconnected',
      healthLabel: 'Disconnected',
      healthReason: 'This account is inactive.',
      requiresReconnect: false,
      daysUntilExpiry: days
    }
  }

  const platformStatus = socialPublishingPlatformProductionStatus(input.platform)
  if (platformStatus && !platformStatus.productionReady) {
    return {
      health: 'attention',
      healthLabel: 'Publishing disabled',
      healthReason: `${platformStatus.label} publishing is not production-ready: ${platformStatus.reason}`,
      requiresReconnect: false,
      daysUntilExpiry: days
    }
  }

  if (tokenExpiresAt && tokenExpiresAt.getTime() <= now.getTime() && !hasRefreshToken) {
    return {
      health: 'reconnect',
      healthLabel: 'Reconnect required',
      healthReason: 'The access token has expired.',
      requiresReconnect: true,
      daysUntilExpiry: days
    }
  }

  const error = input.lastError?.trim()
  if (error) {
    const requiresReconnect = RECONNECT_ERROR_PATTERN.test(error) && !/^webhook subscribe failed/i.test(error)
    return {
      health: requiresReconnect ? 'reconnect' : 'attention',
      healthLabel: requiresReconnect ? 'Reconnect required' : 'Needs attention',
      healthReason: error,
      requiresReconnect,
      daysUntilExpiry: days
    }
  }

  if (
    tokenExpiresAt
    && tokenExpiresAt.getTime() - now.getTime() < EXPIRING_SOON_MS
    && !hasRefreshToken
  ) {
    return {
      health: 'reconnect',
      healthLabel: 'Reconnect soon',
      healthReason: 'The access token expires within 7 days.',
      requiresReconnect: true,
      daysUntilExpiry: days
    }
  }

  if (isWebhookUnsubscribed(input)) {
    return {
      health: 'attention',
      healthLabel: 'Webhook attention',
      healthReason: 'Inbound engagement webhooks are not subscribed for this Meta account.',
      requiresReconnect: false,
      daysUntilExpiry: days
    }
  }

  if (
    input.platform === 'instagram'
    && typeof input.metadata?.via_page_id === 'string'
    && (!input.linkedFacebookAccountId || input.linkedFacebookIsActive === false)
  ) {
    return {
      health: 'attention',
      healthLabel: 'Linked Page missing',
      healthReason: 'This Instagram profile no longer has its linked Facebook Page connected for this client.',
      requiresReconnect: true,
      daysUntilExpiry: days
    }
  }

  return {
    health: 'healthy',
    healthLabel: 'Connected',
    healthReason: null,
    requiresReconnect: false,
    daysUntilExpiry: days
  }
}
