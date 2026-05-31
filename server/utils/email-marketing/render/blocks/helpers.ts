/**
 * Shared helpers for EDM block renderers
 */

/**
 * Escape HTML entities in text content
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escape a URL for safe use in href/src attributes.
 * Escapes HTML entities and blocks javascript:/data: protocols.
 */
export function escapeUrl(url: string | undefined | null): string {
  if (!url) return '#'
  const trimmed = url.trim()
  // Block dangerous protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#'
  return escapeHtml(trimmed)
}

/**
 * Escape font family string for use in HTML style attribute.
 * Replaces double quotes with single quotes to avoid breaking HTML attributes.
 */
export function escapeFontFamilyForHtml(fontFamily: string): string {
  return fontFamily.replace(/"/g, "'")
}

/**
 * Resolve a merge field from context, returning a styled placeholder if missing.
 */
export function renderMergeField(
  context: { mergeFields?: Record<string, string> },
  fieldName: string,
  fallbackLabel: string
): string {
  const value = context.mergeFields?.[fieldName]
  if (value) return escapeHtml(value)
  return `<span style="color:#9ca3af;font-style:italic;">[${escapeHtml(fallbackLabel)}]</span>`
}

/**
 * Format a number as AUD currency (e.g., "$45,990")
 */
export function formatAudPrice(price: number | undefined | null): string {
  if (price == null) return ''
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

/**
 * Render a row of unicode stars for a rating (HTML).
 * Uses ★ (filled) and ☆ (empty) for maximum email client compat.
 */
export function renderStarsHtml(
  rating: number,
  maxStars: number = 5,
  color: string = '#f59e0b'
): string {
  const filled = Math.round(Math.min(rating, maxStars))
  const empty = maxStars - filled
  return `<span style="color:${color};font-size:18px;letter-spacing:2px;">${'★'.repeat(filled)}${'☆'.repeat(empty)}</span>`
}

/**
 * Render unicode stars as a plain string (for MJML text content).
 */
export function renderStarsMjml(rating: number, maxStars: number = 5): string {
  const filled = Math.round(Math.min(rating, maxStars))
  const empty = maxStars - filled
  return `${'★'.repeat(filled)}${'☆'.repeat(empty)}`
}
