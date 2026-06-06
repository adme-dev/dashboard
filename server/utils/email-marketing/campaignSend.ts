// server/utils/email-marketing/campaignSend.ts
// Pure helpers for the campaign sending engine (Phase 2b). No I/O — the chunked
// sender (2b-2) and the campaign endpoints compose these. Kept side-effect-free
// so the send-gate + pacing logic is unit-testable without a DB or Resend.

import type { BridgeCommunicationInput } from '~~/server/utils/crm/commsDb'
import { rewriteHtmlLinksForTracking, type RewriteTrackingInput } from './trackingLinks'

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

export type CampaignPreflightStatus = 'pass' | 'warning' | 'blocked'
export type CampaignPreflightCode
  = | 'unsubscribe'
    | 'sender'
    | 'auth_readiness'
    | 'media_urls'
    | 'html_size'
    | 'footer_identity'
    | 'recipients'

export interface CampaignPreflightCheck {
  code: CampaignPreflightCode
  label: string
  status: CampaignPreflightStatus
  message: string
  value?: string | number | boolean | null
}

export interface CampaignPreflightResult {
  ok: boolean
  blocked: boolean
  checkedAt: string
  htmlBytes: number
  recipientCount: number
  checks: CampaignPreflightCheck[]
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_MAX_HTML_BYTES = 102 * 1024
const RELATIVE_MEDIA_RE = /\b(?:src|background)\s*=\s*["'](?!https?:\/\/|cid:|data:image\/)[^"']+["']|url\(\s*['"]?(?!https?:\/\/|cid:|data:image\/)([^'")]+)['"]?\s*\)/i
const NON_HTTPS_MEDIA_RE = /\b(?:src|background)\s*=\s*["']http:\/\/[^"']+["']|url\(\s*['"]?http:\/\/[^'")]+['"]?\s*\)/i
const FOOTER_IDENTITY_RE = /\b(?:street|st\b|road|rd\b|avenue|ave\b|melbourne|sydney|brisbane|perth|adelaide|australia|vic|nsw|qld|wa|sa|tas|act|nt)\b/i
const PREFLIGHT_LABELS: Record<CampaignPreflightCode, string> = {
  unsubscribe: 'Unsubscribe',
  sender: 'Sender',
  auth_readiness: 'Authentication readiness',
  media_urls: 'Media URLs',
  html_size: 'HTML size',
  footer_identity: 'Footer identity',
  recipients: 'Recipients'
}

export function senderDomainFromEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() || ''
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1)
}

export function isSenderDomainAllowed(
  fromEmail: string | null | undefined,
  allowedSenderDomains?: readonly string[]
): boolean {
  if (allowedSenderDomains === undefined) return true
  const domain = senderDomainFromEmail(fromEmail)
  if (!domain) return false
  return allowedSenderDomains
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
}

function preflightCheck(
  code: CampaignPreflightCode,
  status: CampaignPreflightStatus,
  message: string,
  value?: CampaignPreflightCheck['value']
): CampaignPreflightCheck {
  const base = { code, label: PREFLIGHT_LABELS[code], status, message }
  return value === undefined ? base : { ...base, value }
}

export function buildCampaignPreflight(input: {
  campaign: {
    subject?: string | null
    from_email?: string | null
    body_html?: string | null
  }
  toSend: number
  sendingConfigured: boolean
  senderDomainAuthenticated: boolean
  allowedSenderDomains?: string[]
  checkedAt?: string
  maxHtmlBytes?: number
}): CampaignPreflightResult {
  const html = input.campaign.body_html || ''
  const htmlBytes = Buffer.byteLength(html, 'utf8')
  const maxHtmlBytes = input.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES
  const fromEmail = input.campaign.from_email?.trim() || ''
  const senderOk = fromEmail && EMAIL_RE.test(fromEmail) && Boolean(input.campaign.subject?.trim())
  const senderDomainReady = input.senderDomainAuthenticated && isSenderDomainAllowed(fromEmail, input.allowedSenderDomains)
  const checks: CampaignPreflightCheck[] = []

  checks.push(preflightCheck(
    'unsubscribe',
    bodyHasUnsubscribe(html) ? 'pass' : 'blocked',
    bodyHasUnsubscribe(html)
      ? 'Unsubscribe affordance is present.'
      : 'Campaign HTML must include {{ unsubscribe_url }} or an unsubscribe link.'
  ))

  checks.push(preflightCheck(
    'sender',
    senderOk ? 'pass' : 'blocked',
    senderOk
      ? 'Sender and subject are present.'
      : 'Campaign needs a valid From email before scheduling.',
    fromEmail || null
  ))

  checks.push(preflightCheck(
    'auth_readiness',
    input.sendingConfigured && senderDomainReady ? 'pass' : 'blocked',
    input.sendingConfigured && senderDomainReady
      ? 'Sending transport and sender domain readiness checks passed.'
      : 'Sending transport is not configured or the From domain is not allowed.',
    senderDomainReady
  ))

  const hasUnsafeMedia = RELATIVE_MEDIA_RE.test(html) || NON_HTTPS_MEDIA_RE.test(html)
  checks.push(preflightCheck(
    'media_urls',
    hasUnsafeMedia ? 'warning' : 'pass',
    hasUnsafeMedia
      ? 'Use absolute HTTPS media URLs for sendable email assets.'
      : 'Media URLs are sendable.'
  ))

  checks.push(preflightCheck(
    'html_size',
    htmlBytes > maxHtmlBytes ? 'warning' : 'pass',
    htmlBytes > maxHtmlBytes
      ? `Rendered HTML is ${htmlBytes} bytes; keep it below ${maxHtmlBytes} bytes to reduce clipping risk.`
      : 'Rendered HTML is below the clipping warning threshold.',
    htmlBytes
  ))

  checks.push(preflightCheck(
    'footer_identity',
    FOOTER_IDENTITY_RE.test(html) ? 'pass' : 'warning',
    FOOTER_IDENTITY_RE.test(html)
      ? 'Physical sender identity footer appears present.'
      : 'Add a physical sender identity and postal address footer for marketing mail.'
  ))

  if (input.toSend < 1) {
    checks.push(preflightCheck(
      'recipients',
      'blocked',
      'No recipients are in the scheduled campaign snapshot.',
      input.toSend
    ))
  }

  const blocked = checks.some(check => check.status === 'blocked')
  return {
    ok: !blocked,
    blocked,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    htmlBytes,
    recipientCount: input.toSend,
    checks
  }
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

// Per-recipient unsubscribe URL. `token` is the HMAC signature over
// (campaignId, subscriberId) — see email-marketing/links.ts — that lets the
// public one-click page (Phase 4) act without a session while rejecting
// tampered/guessed ids. Optional so the pure layer stays testable; the sender
// always supplies it.
export function unsubscribeUrl(
  appUrl: string,
  campaignId: string,
  subscriberId: string,
  token?: string
): string {
  const base = `${appUrl.replace(/\/+$/, '')}/email/unsubscribe?c=${campaignId}&s=${subscriberId}`
  return token ? `${base}&t=${token}` : base
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
  appUrl: string,
  unsubToken?: string
): BatchEmail {
  const unsubUrl = unsubscribeUrl(appUrl, campaignId, recipient.subscriber_id, unsubToken)
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

export async function buildTrackedBatchEmail(
  campaign: CampaignContent,
  recipient: { email: string, name: string | null, subscriber_id: string },
  campaignId: string,
  appUrl: string,
  unsubToken: string | undefined,
  tracking: RewriteTrackingInput
): Promise<BatchEmail> {
  const email = buildBatchEmail(campaign, recipient, campaignId, appUrl, unsubToken)
  return {
    ...email,
    html: await rewriteHtmlLinksForTracking(email.html, tracking)
  }
}

// ── Pure: rate-limit (429) handling ─────────────────────────────────────────

// Detect a Resend rate-limit error from its error object / thrown shape.
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string, statusCode?: number, message?: string }
  if (e.statusCode === 429) return true
  if (e.name === 'rate_limit_exceeded') return true
  return /rate.?limit|too many requests/i.test(e.message || '')
}

function retryAfterFromHeaders(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const get = (headers as { get?: unknown }).get
  if (typeof get === 'function') {
    const value = get.call(headers, 'retry-after') ?? get.call(headers, 'Retry-After')
    return typeof value === 'string' && value.trim() ? value : undefined
  }
  const record = headers as Record<string, unknown>
  const value = record['retry-after'] ?? record['Retry-After']
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

export function retryAfterHeaderFromError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as {
    headers?: unknown
    response?: { headers?: unknown }
    retryAfter?: unknown
    retry_after?: unknown
  }
  const header = retryAfterFromHeaders(e.headers) ?? retryAfterFromHeaders(e.response?.headers)
  if (header) return header
  if (typeof e.retryAfter === 'string' || typeof e.retryAfter === 'number') return String(e.retryAfter)
  if (typeof e.retry_after === 'string' || typeof e.retry_after === 'number') return String(e.retry_after)
  return undefined
}

// Parse a Retry-After header (integer seconds, or HTTP-date) into a clamped
// number of seconds. Falls back to `fallbackSec` when absent/unparseable.
export function parseRetryAfter(
  header: string | null | undefined,
  fallbackSec = 2,
  maxSec = 60
): number {
  if (!header) return fallbackSec
  const asInt = Number.parseInt(header.trim(), 10)
  if (Number.isFinite(asInt) && String(asInt) === header.trim()) {
    return Math.min(Math.max(asInt, 1), maxSec)
  }
  const asDate = Date.parse(header)
  if (Number.isFinite(asDate)) {
    // Date.now() is unavailable in some sandboxes; guard it.
    const now = typeof Date.now === 'function' ? Date.now() : NaN
    if (Number.isFinite(now)) {
      const secs = Math.ceil((asDate - now) / 1000)
      return Math.min(Math.max(secs, 1), maxSec)
    }
  }
  return fallbackSec
}

// ── CRM communication bridge (F10) ──────────────────────────────────────────
// Map one campaign send to a CRM-timeline communication. Pure: the gate,
// person-lookup, contact-pref enforcement and idempotency all live in
// bridgeCommunication(). Returns null when there's nothing to log (no tenant to
// scope to, or no recipient address). The externalId is deterministic
// (campaign:subscriber) so a re-send of the same recipient dedupes — it does NOT
// depend on the Resend message id, which may be null on a partial batch result.
export function buildCampaignBridgeInput(
  campaign: { id: string, client_id: string | null, subject: string | null },
  recipient: { email: string, subscriber_id: string }
): BridgeCommunicationInput | null {
  if (!campaign.client_id || !recipient.email) return null
  return {
    clientId: campaign.client_id,
    contactEmail: recipient.email,
    channel: 'email',
    direction: 'outbound',
    source: 'email_bridge',
    externalId: `${campaign.id}:${recipient.subscriber_id}`,
    subject: campaign.subject,
    body: null
  }
}
