const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi
const MEDIA_ATTR_RE = /\b(src|background)=(["'])([^"']+)\2/gi
const CSS_URL_RE = /url\((\s*['"]?)([^'")]+)(['"]?\s*)\)/gi

function absoluteUrl(value: string, appUrl: string): string {
  const trimmed = value.trim()
  if (
    !trimmed
    || /^(?:https?:|cid:|data:image\/|#|\{\{)/i.test(trimmed)
    || trimmed.startsWith('//')
  ) {
    return value
  }

  try {
    return new URL(trimmed, appUrl).toString()
  } catch {
    return value
  }
}

export function dedupeExactStyleTags(html: string): string {
  const seen = new Set<string>()
  return html.replace(STYLE_TAG_RE, (tag) => {
    const key = tag.replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return ''
    seen.add(key)
    return tag
  })
}

export function absolutizeMediaAssetUrls(html: string, appUrl: string): string {
  return html
    .replace(MEDIA_ATTR_RE, (_match, attr: string, quote: string, value: string) => {
      return `${attr}=${quote}${absoluteUrl(value, appUrl)}${quote}`
    })
    .replace(CSS_URL_RE, (_match, prefix: string, value: string, suffix: string) => {
      return `url(${prefix}${absoluteUrl(value, appUrl)}${suffix})`
    })
}

export function prepareSendableHtml(html: string, appUrl: string): string {
  return absolutizeMediaAssetUrls(dedupeExactStyleTags(html), appUrl)
}
