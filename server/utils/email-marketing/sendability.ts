import { bodyHasUnsubscribe } from './campaignSend'

export type SendabilitySeverity = 'error' | 'warning'

export interface SendabilityIssue {
  code: string
  severity: SendabilitySeverity
  message: string
  value?: string
}

export interface SendabilityReport {
  ok: boolean
  htmlBytes: number
  errors: SendabilityIssue[]
  warnings: SendabilityIssue[]
  issues: SendabilityIssue[]
}

export interface SendabilityInput {
  html: string | null | undefined
  subject?: string | null
  previewText?: string | null
  requireUnsubscribe?: boolean
  maxHtmlBytes?: number
}

const DEFAULT_MAX_HTML_BYTES = 102 * 1024
const UNSAFE_TAG_RE = /<\s*(script|iframe|object|embed|form|input|textarea|select|button|video|audio|canvas|svg)\b/i
const PLACEHOLDER_RE = /\[[\w -]+\]\s*(?:—|-)\s*available in upcoming update/i
const RELATIVE_MEDIA_ATTR_RE = /\b(?:src|background)\s*=\s*["'](?!https?:\/\/|cid:|data:image\/)[^"']+["']/gi
const RELATIVE_CSS_URL_RE = /url\(\s*['"]?(?!https?:\/\/|cid:|data:image\/)([^'")]+)['"]?\s*\)/gi

function issue(severity: SendabilitySeverity, code: string, message: string, value?: string): SendabilityIssue {
  return value ? { severity, code, message, value } : { severity, code, message }
}

export function checkEmailSendability(input: SendabilityInput): SendabilityReport {
  const html = input.html || ''
  const htmlBytes = Buffer.byteLength(html, 'utf8')
  const issues: SendabilityIssue[] = []

  if (!html.trim()) {
    issues.push(issue('error', 'missing_html', 'Rendered email HTML is empty.'))
  }

  if (!input.subject?.trim()) {
    issues.push(issue('error', 'missing_subject', 'Add a subject line before sending a test.'))
  }

  if (!input.previewText?.trim()) {
    issues.push(issue('warning', 'missing_preview_text', 'Add preview text so inbox snippets are controlled.'))
  }

  if (PLACEHOLDER_RE.test(html)) {
    issues.push(issue('error', 'renderer_placeholder', 'Rendered HTML still contains a block placeholder.'))
  }

  const unsafeTag = html.match(UNSAFE_TAG_RE)?.[1]
  if (unsafeTag) {
    issues.push(issue('error', 'unsafe_tag', `Remove unsupported or unsafe <${unsafeTag}> markup.`, unsafeTag))
  }

  if (input.requireUnsubscribe && !bodyHasUnsubscribe(html)) {
    issues.push(issue('error', 'missing_unsubscribe', 'Campaign email HTML must include {{ unsubscribe_url }} or an unsubscribe link.'))
  }

  const maxHtmlBytes = input.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES
  if (htmlBytes > maxHtmlBytes) {
    issues.push(issue(
      'warning',
      'html_size',
      `Rendered HTML is ${htmlBytes} bytes; keep it below ${maxHtmlBytes} bytes to reduce clipping risk.`,
      String(htmlBytes)
    ))
  }

  const mediaMatches = [
    ...html.matchAll(RELATIVE_MEDIA_ATTR_RE),
    ...html.matchAll(RELATIVE_CSS_URL_RE)
  ]
  if (mediaMatches.length > 0) {
    issues.push(issue(
      'warning',
      'relative_media_url',
      'Use absolute HTTPS media URLs for sendable email assets.',
      mediaMatches[0]?.[0]
    ))
  }

  const errors = issues.filter(item => item.severity === 'error')
  const warnings = issues.filter(item => item.severity === 'warning')
  return { ok: errors.length === 0, htmlBytes, errors, warnings, issues }
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li|tr)\s*>/gi, '\n\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
