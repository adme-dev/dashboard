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

export function appendEmailUtm(
  destinationUrl: string,
  campaignId: string,
  emailClickId?: string | null
): string {
  const url = new URL(destinationUrl)
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'email')
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'email')
  if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', campaignId)
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

export async function rewriteHtmlLinksForTracking(
  html: string,
  input: RewriteTrackingInput
): Promise<string> {
  const replacements: Array<{ start: number, end: number, value: string }> = []
  for (const match of html.matchAll(HREF_RE)) {
    const href = match[2] ?? ''
    if (!isTrackableEmailHref(href) || match.index == null) continue
    const quote = match[1] ?? '"'
    const clickUrl = await buildEmailClickUrl({
      ...input,
      destinationUrl: href
    })
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `href=${quote}${clickUrl}${quote}`
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
