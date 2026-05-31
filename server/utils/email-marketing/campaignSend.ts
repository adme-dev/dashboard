// server/utils/email-marketing/campaignSend.ts
// Pure helpers for the campaign sending engine (Phase 2b). No I/O — the chunked
// sender (2b-2) and the campaign endpoints compose these. Kept side-effect-free
// so the send-gate + pacing logic is unit-testable without a DB or Resend.

export const CAMPAIGN_STATUSES = [
  'draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'
] as const

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number]

// Resend Batch API hard limit — never enqueue more than this per request.
export const RESEND_BATCH_LIMIT = 100

// Allowed status transitions. Anything not listed is rejected by canTransition.
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['scheduled', 'sending', 'cancelled'],
  scheduled: ['sending', 'draft', 'cancelled'],
  sending: ['paused', 'sent', 'cancelled'],
  paused: ['sending', 'cancelled'],
  sent: [],
  cancelled: []
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

// Split an array into fixed-size chunks (defaults to the Resend batch limit).
// Used to turn the recipient set into Batch-API-sized send jobs.
export function chunk<T>(items: T[], size: number = RESEND_BATCH_LIMIT): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

// Send gate (spec §2/§4): a campaign body MUST contain an unsubscribe affordance
// before it can send — either the {{unsubscribe_url}} merge tag (substituted per
// recipient at send time) or a literal link whose href mentions "unsubscribe".
export function bodyHasUnsubscribe(html: string | null | undefined): boolean {
  if (!html) return false
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) return true
  if (/href\s*=\s*["'][^"']*unsubscribe[^"']*["']/i.test(html)) return true
  return false
}

export interface SendGateInput {
  status: CampaignStatus
  toSend: number
  bodyHtml: string | null | undefined
}

export interface SendGateResult {
  ok: boolean
  reason?: string
}

// Whether a campaign may enter the `sending` state. Enforced in code, not just
// convention (spec §2 "Send gate").
export function canEnterSending(input: SendGateInput): SendGateResult {
  if (!canTransition(input.status, 'sending')) {
    return { ok: false, reason: `cannot send from status "${input.status}"` }
  }
  if (input.toSend < 1) {
    return { ok: false, reason: 'no recipients — materialize the campaign first' }
  }
  if (!bodyHasUnsubscribe(input.bodyHtml)) {
    return { ok: false, reason: 'body is missing an unsubscribe link ({{unsubscribe_url}})' }
  }
  return { ok: true }
}

// ── Pure send-formatting helpers (no I/O — kept here so they're testable
// without pulling the Resend transport / DB) ───────────────────────────────

// The campaign fields the per-recipient render needs.
export interface CampaignContent {
  subject: string | null
  from_name: string | null
  from_email: string | null
  reply_to: string | null
  body_html: string | null
}

// Per-recipient unsubscribe URL. The one-click page + token land in Phase 4;
// this is the stable URL shape the {{unsubscribe_url}} merge tag resolves to.
export function unsubscribeUrl(appUrl: string, campaignId: string, subscriberId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/email/unsubscribe?c=${campaignId}&s=${subscriberId}`
}

const MERGE_TAG = /\{\{\s*([a-z_]+)\s*\}\}/gi

// Replace {{ key }} tokens (any spacing, case-insensitive) from vars; unknown
// tags resolve to '' so no literal braces leak into the sent email.
export function substituteMergeTags(html: string, vars: Record<string, string>): string {
  return html.replace(MERGE_TAG, (_match, key: string) => vars[key.toLowerCase()] ?? '')
}

export function recipientVars(
  recipient: { email: string, name: string | null },
  unsubUrl: string
): Record<string, string> {
  const name = (recipient.name || '').trim()
  const firstName = name.split(/\s+/)[0] || ''
  return { email: recipient.email, name, first_name: firstName, unsubscribe_url: unsubUrl }
}

export interface BatchEmail {
  from: string
  to: string[]
  subject: string
  html: string
  headers: Record<string, string>
  replyTo?: string
}

// Build one personalized Batch email with the RFC 8058 one-click unsubscribe
// headers (spec §4). Pure — given a campaign + recipient it returns the payload.
export function buildBatchEmail(
  campaign: CampaignContent,
  recipient: { email: string, name: string | null, subscriber_id: string },
  campaignId: string,
  appUrl: string
): BatchEmail {
  const unsubUrl = unsubscribeUrl(appUrl, campaignId, recipient.subscriber_id)
  const vars = recipientVars(recipient, unsubUrl)
  const from = campaign.from_name
    ? `${campaign.from_name} <${campaign.from_email}>`
    : (campaign.from_email || '')
  const email: BatchEmail = {
    from,
    to: [recipient.email],
    subject: substituteMergeTags(campaign.subject || '', vars),
    html: substituteMergeTags(campaign.body_html || '', vars),
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  }
  if (campaign.reply_to) email.replyTo = campaign.reply_to
  return email
}
