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
