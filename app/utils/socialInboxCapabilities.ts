import type { SocialChannelType } from '~/types'

type BadgeColor = 'error' | 'success' | 'warning' | 'neutral'

interface CapabilityConversation {
  platform?: string | null
  channel_type?: SocialChannelType | string | null
}

interface ReplyCapability {
  enabled: boolean
  label: string
  color: BadgeColor
  reason?: string
}

export interface SocialInboxCapabilities {
  platformLabel: string
  channelLabel: string
  reply: ReplyCapability
  syncLabel: string
}

const PLATFORM_LABELS: Record<string, string> = {
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'tiktok': 'TikTok',
  'linkedin': 'LinkedIn',
  'youtube': 'YouTube',
  'google-business': 'Google Business'
}

const CHANNEL_LABELS: Record<string, string> = {
  comment: 'Comment',
  dm: 'Direct message',
  mention: 'Mention',
  review: 'Review'
}

const REPLY_LABELS: Record<string, string> = {
  comment: 'Public comment reply',
  dm: 'Direct message reply',
  mention: 'Mention reply',
  review: 'Review response'
}

const SUPPORTED_REPLY_CHANNELS: Record<string, Set<string>> = {
  'facebook': new Set(['comment', 'dm', 'mention', 'review']),
  'instagram': new Set(['comment', 'dm', 'mention']),
  'linkedin': new Set(['comment']),
  'youtube': new Set(['comment']),
  'google-business': new Set(['review'])
}

const READ_ONLY_PLATFORM_REASONS: Record<string, string> = {
  tiktok: 'TikTok replies require additional API access.'
}

function normalizePlatform(platform: string | null | undefined) {
  return (platform || '').trim().toLowerCase()
}

function normalizeChannel(channel: string | null | undefined) {
  return (channel || '').trim().toLowerCase()
}

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] || platform || 'Unknown platform'
}

function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel] || channel || 'Conversation'
}

export function getSocialInboxCapabilities(conversation: CapabilityConversation | null): SocialInboxCapabilities {
  const platform = normalizePlatform(conversation?.platform)
  const channel = normalizeChannel(conversation?.channel_type)
  const label = platformLabel(platform)
  const channelText = channelLabel(channel)
  const readOnlyReason = READ_ONLY_PLATFORM_REASONS[platform]
  const supportedChannels = SUPPORTED_REPLY_CHANNELS[platform]

  let reply: ReplyCapability
  if (readOnlyReason) {
    reply = { enabled: false, label: 'Read-only', color: 'warning', reason: readOnlyReason }
  } else if (!supportedChannels) {
    reply = { enabled: false, label: 'Read-only', color: 'warning', reason: 'Replies are not wired for this platform yet.' }
  } else if (!supportedChannels.has(channel)) {
    reply = {
      enabled: false,
      label: 'Read-only',
      color: 'warning',
      reason: `${channelText} replies are not wired for ${label}.`
    }
  } else {
    reply = {
      enabled: true,
      label: REPLY_LABELS[channel] || 'Reply',
      color: 'success'
    }
  }

  return {
    platformLabel: label,
    channelLabel: channelText,
    reply,
    syncLabel: 'Imported by account sync'
  }
}
