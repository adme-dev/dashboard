import { normalizeBudgetPlatform } from '~~/server/utils/campaignBudgetIdentity'

export interface SocialCampaignFeedbackExample {
  conversationId: string
  channelType: string | null
  preview: string | null
  permalink: string | null
  sentiment: number | null
  rating: number | null
  lastMessageAt: string | null
}

export interface SocialCampaignFeedbackSummary {
  totalCount: number
  negativeCount: number
  latestAt: string | null
  examples: SocialCampaignFeedbackExample[]
}

export interface SocialCampaignFeedbackRow {
  conversation_id: string
  client_id?: string | null
  platform?: string | null
  paid_media_platform?: string | null
  paid_media_campaign_id?: string | null
  channel_type?: string | null
  sentiment?: number | string | null
  rating?: number | string | null
  last_message_at?: string | null
  last_message_preview?: string | null
  permalink?: string | null
}

export interface SocialCampaignFeedbackSummaryInput {
  totalCount?: unknown
  negativeCount?: unknown
  latestAt?: string | null
  examples?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function count(value: unknown): number {
  const n = num(value)
  return n == null ? 0 : Math.max(0, Math.trunc(n))
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = clean(record[key])
    if (value) return value
  }
  return null
}

function parseExample(value: unknown): SocialCampaignFeedbackExample | null {
  if (!isRecord(value)) return null
  const conversationId = readString(value, 'conversationId', 'conversation_id', 'id')
  if (!conversationId) return null
  return {
    conversationId,
    channelType: readString(value, 'channelType', 'channel_type'),
    preview: readString(value, 'preview', 'lastMessagePreview', 'last_message_preview'),
    permalink: readString(value, 'permalink'),
    sentiment: num(value.sentiment),
    rating: num(value.rating),
    lastMessageAt: readString(value, 'lastMessageAt', 'last_message_at')
  }
}

function parseExamples(value: unknown): SocialCampaignFeedbackExample[] {
  const raw = typeof value === 'string'
    ? JSON.parse(value || '[]') as unknown
    : value
  if (!Array.isArray(raw)) return []
  return raw.map(parseExample).filter((example): example is SocialCampaignFeedbackExample => Boolean(example))
}

export function normalizeSocialFeedbackPlatform(platform: unknown): string {
  return normalizeBudgetPlatform(platform)
}

export function isNegativeSocialFeedback(value: { sentiment?: unknown, rating?: unknown }): boolean {
  const sentiment = num(value.sentiment)
  const rating = num(value.rating)
  return (sentiment != null && sentiment < 0) || (rating != null && rating <= 2)
}

export function buildSocialCampaignFeedbackKey(input: {
  clientId?: string | null
  platform?: string | null
  campaignId?: string | null
}): string | null {
  const clientId = clean(input.clientId)
  const campaignId = clean(input.campaignId)
  if (!clientId || !campaignId) return null
  return [
    clientId,
    normalizeSocialFeedbackPlatform(input.platform),
    campaignId
  ].join('::')
}

export function parseSocialCampaignFeedbackSummary(
  input: SocialCampaignFeedbackSummaryInput
): SocialCampaignFeedbackSummary | null {
  const totalCount = count(input.totalCount)
  const negativeCount = count(input.negativeCount)
  if (totalCount <= 0 && negativeCount <= 0) return null

  let examples: SocialCampaignFeedbackExample[] = []
  try {
    examples = parseExamples(input.examples)
      .filter(isNegativeSocialFeedback)
      .slice(0, 3)
  } catch {
    examples = []
  }

  return {
    totalCount,
    negativeCount,
    latestAt: input.latestAt ?? null,
    examples
  }
}

export function summarizeSocialCampaignFeedbackRows(rows: SocialCampaignFeedbackRow[]): Map<string, SocialCampaignFeedbackSummary> {
  const grouped = new Map<string, SocialCampaignFeedbackRow[]>()
  for (const row of rows) {
    const key = buildSocialCampaignFeedbackKey({
      clientId: row.client_id,
      platform: row.paid_media_platform ?? row.platform,
      campaignId: row.paid_media_campaign_id
    })
    if (!key) continue
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }

  const summaries = new Map<string, SocialCampaignFeedbackSummary>()
  for (const [key, group] of grouped) {
    const ordered = [...group].sort((a, b) =>
      new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
    const negative = ordered.filter(isNegativeSocialFeedback)
    summaries.set(key, {
      totalCount: ordered.length,
      negativeCount: negative.length,
      latestAt: ordered[0]?.last_message_at ?? null,
      examples: negative.slice(0, 3).map(row => ({
        conversationId: row.conversation_id,
        channelType: row.channel_type ?? null,
        preview: row.last_message_preview ?? null,
        permalink: row.permalink ?? null,
        sentiment: num(row.sentiment),
        rating: num(row.rating),
        lastMessageAt: row.last_message_at ?? null
      }))
    })
  }
  return summaries
}
