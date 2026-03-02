/**
 * Enhanced URL scraper for banner generation.
 * Extracts headlines, subheadlines, CTAs, images, colors, and metadata.
 */

export interface ScrapedPage {
  url: string
  title?: string
  description?: string
  headline?: string
  subheadlines: string[]
  ctaTexts: string[]
  images: string[]
  ogImage?: string
  favicon?: string
  brandName?: string
  themeColor?: string
  primaryColors: string[]
}

export async function scrapeUrl(url: string): Promise<ScrapedPage> {
  // Block private/internal URLs
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host === '[::1]' || host.endsWith('.local')) {
    return emptyResult(url)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgencyBot/1.0; +https://xeroflow.agency)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return emptyResult(url)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return emptyResult(url)
    }

    // Read first 100KB to find body content
    const reader = response.body?.getReader()
    if (!reader) return emptyResult(url)

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 100 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel()

    return parseHtml(html, url)
  } catch {
    clearTimeout(timeout)
    return emptyResult(url)
  }
}

function emptyResult(url: string): ScrapedPage {
  return {
    url,
    subheadlines: [],
    ctaTexts: [],
    images: [],
    primaryColors: [],
  }
}

function parseHtml(html: string, url: string): ScrapedPage {
  const result: ScrapedPage = {
    url,
    subheadlines: [],
    ctaTexts: [],
    images: [],
    primaryColors: [],
  }

  // OG / meta tags
  result.title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTitle(html)
  result.description = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description')
  result.ogImage = resolveIfPresent(extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'), url)
  result.brandName = extractMeta(html, 'og:site_name') || new URL(url).hostname.replace('www.', '')
  result.themeColor = extractMeta(html, 'theme-color')

  // Favicon
  const faviconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
  result.favicon = faviconMatch?.[1]
    ? resolveUrl(faviconMatch[1], url)
    : `${new URL(url).origin}/favicon.ico`

  // <h1> — primary headline
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1Match) {
    result.headline = stripTags(h1Match[1]).trim()
  }

  // <h2> — first 3 subheadlines
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi
  let h2Match
  while ((h2Match = h2Regex.exec(html)) !== null && result.subheadlines.length < 3) {
    const text = stripTags(h2Match[1]).trim()
    if (text.length > 2 && text.length < 200) {
      result.subheadlines.push(text)
    }
  }

  // CTA texts from <a> and <button> elements
  const ctaRegex = /<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi
  let ctaMatch
  const seenCta = new Set<string>()
  while ((ctaMatch = ctaRegex.exec(html)) !== null && result.ctaTexts.length < 5) {
    const text = stripTags(ctaMatch[1]).trim()
    const lower = text.toLowerCase()
    if (text.length >= 3 && text.length <= 40 && !seenCta.has(lower) && isCTALike(lower)) {
      seenCta.add(lower)
      result.ctaTexts.push(text)
    }
  }

  // Images — first 10 <img> src values
  const imgRegex = /<img[^>]*src=["']([^"']+)["']/gi
  let imgMatch
  const seenImg = new Set<string>()
  while ((imgMatch = imgRegex.exec(html)) !== null && result.images.length < 10) {
    const src = resolveUrl(imgMatch[1], url)
    if (!seenImg.has(src) && !src.includes('data:') && !src.includes('tracking') && !src.includes('pixel')) {
      seenImg.add(src)
      result.images.push(src)
    }
  }

  // Color extraction from inline styles (best effort)
  const colorRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g
  const colorMatches = html.match(colorRegex) || []
  const colorCounts = new Map<string, number>()
  for (const c of colorMatches) {
    const normalized = c.toLowerCase()
    // Skip black, white, and very common defaults
    if (['#000', '#000000', '#fff', '#ffffff', '#333', '#333333', '#666', '#666666', '#999', '#999999', '#ccc', '#cccccc'].includes(normalized)) continue
    colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1)
  }
  result.primaryColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c)

  return result
}

function isCTALike(text: string): boolean {
  const ctaKeywords = ['shop', 'buy', 'book', 'get', 'learn', 'discover', 'explore', 'view', 'see', 'try', 'start', 'sign', 'enquire', 'contact', 'call', 'order', 'download', 'apply', 'register', 'subscribe', 'find', 'offer', 'deal', 'save', 'more', 'now', 'free', 'test drive']
  return ctaKeywords.some(kw => text.includes(kw))
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')
}

function extractMeta(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }
  return null
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1]?.trim() || undefined
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

function resolveIfPresent(val: string | null, base: string): string | undefined {
  if (!val) return undefined
  return resolveUrl(val, base)
}
