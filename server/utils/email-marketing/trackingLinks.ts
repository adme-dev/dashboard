import { parseFragment } from 'parse5'
import { signEmailToken, verifyEmailToken } from './links'

export interface EmailClickLinkInput {
  appUrl: string
  campaignId: string
  subscriberId: string
  destinationUrl: string
  secret: string
}

export interface EmailClickVerifyInput {
  campaignId: string
  subscriberId: string
  destinationUrl: string
  token: string | null | undefined
  secret: string
}

export interface RewriteTrackingInput {
  appUrl: string
  campaignId: string
  subscriberId: string
  secret: string
}

const HREF_RE = /\bhref\s*=\s*(["'])(.*?)\1/gi
const SKIP_PROTOCOL_RE = /^(?:mailto:|tel:|sms:)/i

/** Editable per-campaign UTM values (M06). Absent keys keep the historical
 * defaults (email/email/<campaignId>); author-set link parameters always win. */
export interface EmailUtmSettings {
  source?: string
  medium?: string
  campaign?: string
  term?: string
  content?: string
}

export const EMAIL_UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const
const UTM_VALUE = /^[A-Za-z0-9 ._+-]{1,100}$/

/** Strict parse of stored or submitted settings; null means "defaults". */
export function parseEmailUtmSettings(input: unknown): EmailUtmSettings | null {
  if (input == null) return null
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_UTM_SETTINGS')
  const out: EmailUtmSettings = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(EMAIL_UTM_KEYS as readonly string[]).includes(key)) throw new Error('INVALID_UTM_SETTINGS')
    if (value == null || value === '') continue
    if (typeof value !== 'string' || !UTM_VALUE.test(value.trim())) throw new Error('INVALID_UTM_SETTINGS')
    out[key as keyof EmailUtmSettings] = value.trim()
  }
  return Object.keys(out).length ? out : null
}

/** Lenient read of a frozen stored value: malformed data falls back to defaults. */
export function storedEmailUtmSettings(input: unknown): EmailUtmSettings | null {
  try {
    return parseEmailUtmSettings(input)
  } catch {
    return null
  }
}

export function appendEmailUtm(
  destinationUrl: string,
  campaignId: string,
  emailClickId?: string | null,
  settings?: EmailUtmSettings | null
): string {
  const url = new URL(destinationUrl)
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', settings?.source || 'email')
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', settings?.medium || 'email')
  if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', settings?.campaign || campaignId)
  if (settings?.term && !url.searchParams.has('utm_term')) url.searchParams.set('utm_term', settings.term)
  if (settings?.content && !url.searchParams.has('utm_content')) url.searchParams.set('utm_content', settings.content)
  if (emailClickId && !url.searchParams.has('email_click_id')) url.searchParams.set('email_click_id', emailClickId)
  return url.toString()
}

export function isTrackableEmailHref(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (trimmed.includes('{{') || trimmed.includes('}}')) return false
  if (SKIP_PROTOCOL_RE.test(trimmed)) return false
  if (/unsubscribe/i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    // The hosted web version link is a recipient-free capability URL; wrapping
    // it would attach a subscriber identity, so it stays exactly as signed.
    if (url.pathname === '/email/view' && url.searchParams.has('t')) return false
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export async function buildEmailClickUrl(input: EmailClickLinkInput): Promise<string> {
  const base = input.appUrl.replace(/\/+$/, '')
  const url = new URL(`${base}/email/click`)
  url.searchParams.set('c', input.campaignId)
  url.searchParams.set('s', input.subscriberId)
  url.searchParams.set('u', input.destinationUrl)
  url.searchParams.set(
    't',
    await signEmailToken(input.secret, 'click', input.campaignId, input.subscriberId, input.destinationUrl)
  )
  return url.toString()
}

export async function verifyEmailClickToken(input: EmailClickVerifyInput): Promise<boolean> {
  return verifyEmailToken(
    input.secret,
    input.token,
    'click',
    input.campaignId,
    input.subscriberId,
    input.destinationUrl
  )
}

/** Single owner of href rewriting: reads each logical URL exactly as an HTML
 * client does and serializes the replacement once as HTML. */
export async function rewriteTrackableHrefs(
  html: string,
  mapHref: (logicalHref: string) => string | Promise<string>
): Promise<string> {
  const replacements: Array<{ start: number, end: number, value: string }> = []
  for (const match of html.matchAll(HREF_RE)) {
    // Read the logical URL exactly as an HTML client does. Merge values and
    // compiled native buttons encode ampersands; signing '&amp;' as URL data
    // would change destination query keys and invalidate recipient links.
    const node = parseFragment(`<a ${match[0]}></a>`).childNodes[0]
    const href = node && 'attrs' in node ? node.attrs.find(attribute => attribute.name === 'href')?.value || '' : ''
    if (!isTrackableEmailHref(href) || match.index == null) continue
    const quote = match[1] ?? '"'
    const next = await mapHref(href)
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `href=${quote}${next.replaceAll('&', '&amp;')}${quote}`
    })
  }

  let out = ''
  let cursor = 0
  for (const replacement of replacements) {
    out += html.slice(cursor, replacement.start)
    out += replacement.value
    cursor = replacement.end
  }
  return out + html.slice(cursor)
}

export async function rewriteHtmlLinksForTracking(
  html: string,
  input: RewriteTrackingInput
): Promise<string> {
  return rewriteTrackableHrefs(html, destinationUrl => buildEmailClickUrl({ ...input, destinationUrl }))
}

/** Hosted web version: no recipient exists, so links carry campaign UTM only
 * (never a click/subscriber identity). Same parse/serialize contract. */
export async function decorateHtmlLinksWithUtm(
  html: string,
  campaignId: string,
  settings?: EmailUtmSettings | null
): Promise<string> {
  return rewriteTrackableHrefs(html, href => appendEmailUtm(href, campaignId, null, settings))
}
