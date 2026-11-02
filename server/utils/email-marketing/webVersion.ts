// server/utils/email-marketing/webVersion.ts
// Opt-in hosted web version ("view in browser") of a frozen campaign (M06).
// The link is signed for purpose `webview` over (campaign, frozen content
// digest) only — no subscriber identity — so it is not reusable as an
// unsubscribe or click token and cannot address a later content version.
// Serves the stored body_html only: never recompiles body_source, never joins
// mutable merge-tag/condition definitions, never renders subscriber data.

import { resolveConditionalHtml } from '../../../shared/emailRendering/conditions'
import { resolveEmailMergeTags } from '../../../shared/emailRendering/mergeTags'
import { signEmailToken, verifyEmailToken } from './links'
import { decorateHtmlLinksWithUtm, storedEmailUtmSettings } from './trackingLinks'

export const WEB_VERSION_STATUSES = new Set(['scheduled', 'sending', 'paused', 'sent'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIGEST = /^[a-f0-9]{64}$/
const TOKEN = /^[a-f0-9]{32}$/

/** No scripts, frames, forms, plugins, base rewriting or framing; images and
 * inline styles only. `sandbox` also denies same-origin storage/credentials. */
export const WEB_VERSION_CSP = [
  'default-src \'none\'',
  'img-src https: data:',
  'style-src \'unsafe-inline\'',
  'font-src https: data:',
  'base-uri \'none\'',
  'form-action \'none\'',
  'frame-ancestors \'none\'',
  'sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'
].join('; ')

export const WEB_VERSION_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': WEB_VERSION_CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
}

export async function signWebVersionToken(secret: string, campaignId: string, contentDigest: string): Promise<string> {
  return signEmailToken(secret, 'webview', campaignId, contentDigest)
}

export async function buildWebVersionUrl(appUrl: string, campaignId: string, contentDigest: string, secret: string): Promise<string> {
  const url = new URL(`${appUrl.replace(/\/+$/, '')}/email/view`)
  url.searchParams.set('c', campaignId)
  url.searchParams.set('v', contentDigest)
  url.searchParams.set('t', await signWebVersionToken(secret, campaignId, contentDigest))
  return url.toString()
}

export interface WebVersionRequest {
  campaignId: string
  contentDigest: string
}

/** Shape + signature check before any database read. */
export async function verifyWebVersionRequest(
  query: { c?: unknown, v?: unknown, t?: unknown },
  secret: string
): Promise<WebVersionRequest | null> {
  const one = (value: unknown) => Array.isArray(value) ? value[0] : value
  const campaignId = one(query.c)
  const contentDigest = one(query.v)
  const token = one(query.t)
  if (typeof campaignId !== 'string' || !UUID.test(campaignId)) return null
  if (typeof contentDigest !== 'string' || !DIGEST.test(contentDigest)) return null
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  if (!await verifyEmailToken(secret, token, 'webview', campaignId, contentDigest)) return null
  return { campaignId, contentDigest }
}

export interface FrozenWebVersionRow {
  id: string
  status: string
  web_version_enabled: boolean | null
  review_required?: boolean | null
  body_html: string | null
  subject: string | null
  utm_settings: unknown
  digest: string
}

/** The signed version is the recipient-visible content digest (not the review
 * digest): the audience is not part of what a web-version reader sees. */
export const WEB_VERSION_ROW_SQL = `SELECT c.id, c.status, c.web_version_enabled, c.review_required, c.body_html, c.subject, c.utm_settings,
    email_campaign_content_digest_of(c) AS digest
  FROM campaigns c WHERE c.id = $1`

/** True only for an opted-in, gated, frozen (non-draft) campaign whose current
 * database digest is exactly the signed content version. Only gated campaigns
 * guarantee frozen content after leaving draft. Independent of the workflow
 * flag: links already sent keep working through a rollback. */
export function webVersionAvailable(row: FrozenWebVersionRow | null, request: WebVersionRequest): row is FrozenWebVersionRow {
  return !!row
    && row.review_required === true
    && row.web_version_enabled === true
    && WEB_VERSION_STATUSES.has(row.status)
    && row.digest === request.contentDigest
    && typeof row.body_html === 'string'
    && row.body_html.length > 0
}

const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\s*>/gi
const ACTIVE_TAG = /<(?:script|base|meta\b[^>]*http-equiv|iframe|frame|object|embed|form|link\b[^>]*rel\s*=\s*["']?(?:import|preload|prefetch|manifest))[^>]*>/gi

function stripActiveContent(html: string): string {
  // Defence in depth only; the CSP/sandbox above is the execution boundary.
  return html.replace(SCRIPT_BLOCK, '').replace(ACTIVE_TAG, '')
}

/** Generic, recipient-free rendering of frozen HTML. Conditions evaluate
 * BEFORE merge resolution against an empty recipient (so personalised
 * branches stay hidden); merge tags resolve with no recipient values, leaving
 * only authored fallbacks; then campaign UTM is applied to links. */
export async function renderFrozenWebVersion(row: FrozenWebVersionRow): Promise<string> {
  const generic = resolveConditionalHtml(row.body_html || '', {})
  const merged = resolveEmailMergeTags(generic, { unsubscribe_url: '', web_version_url: '' }, { missing: 'empty', fallbackEncoding: 'html' })
  const linked = await decorateHtmlLinksWithUtm(merged, row.id, storedEmailUtmSettings(row.utm_settings))
  return stripActiveContent(linked)
}

export const WEB_VERSION_UNAVAILABLE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Email unavailable</title></head>'
  + '<body style="font-family:system-ui,sans-serif;padding:32px;color:#45474d"><p>This email is not available in a browser.</p></body></html>'
