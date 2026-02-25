/**
 * Fetch link preview (OG metadata) for a URL
 * GET /api/chat/link-preview?url=...
 */

import { requireAuth } from '~~/server/utils/auth'

interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
  siteName?: string
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const { url } = getQuery(event) as { url?: string }

  if (!url || typeof url !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'URL parameter is required' })
  }

  // Basic URL validation
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol')
    }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }

  try {
    // Fetch the page with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgencyBot/1.0; +https://xeroflow.agency)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { url, title: null, description: null }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return { url, title: null, description: null }
    }

    // Read first 50KB to find OG tags (no need to download entire page)
    const reader = response.body?.getReader()
    if (!reader) return { url, title: null, description: null }

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 50 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      // Stop if we've passed </head>
      if (html.includes('</head>')) break
    }
    reader.cancel()

    const preview: LinkPreview = { url }

    // Extract OG tags
    const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title')
    const ogDesc = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description')
    const ogImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
    const ogSiteName = extractMeta(html, 'og:site_name')

    // Extract <title> as fallback
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const pageTitle = titleMatch?.[1]?.trim()

    preview.title = ogTitle || pageTitle || undefined
    preview.description = ogDesc || undefined
    preview.image = ogImage ? resolveUrl(ogImage, url) : undefined
    preview.siteName = ogSiteName || new URL(url).hostname || undefined

    // Favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
    preview.favicon = faviconMatch?.[1]
      ? resolveUrl(faviconMatch[1], url)
      : `${new URL(url).origin}/favicon.ico`

    return preview
  } catch {
    // Timeout or fetch error — return minimal
    return { url, title: null, description: null }
  }
})

function extractMeta(html: string, name: string): string | null {
  // Match both property="og:..." and name="description" patterns
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegExp(name)}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}
