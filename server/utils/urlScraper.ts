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
  /** Font families referenced via Google Fonts links, @font-face or font-family declarations */
  fontFamilies: string[]
  /** Likely logo images: <img> with logo/brand in src/alt/class, apple-touch-icon, SVG in header */
  logoCandidates: string[]
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
    fontFamilies: [],
    logoCandidates: [],
  }
}

function parseHtml(html: string, url: string): ScrapedPage {
  const result: ScrapedPage = {
    url,
    subheadlines: [],
    ctaTexts: [],
    images: [],
    primaryColors: [],
    fontFamilies: [],
    logoCandidates: [],
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

  // Fonts: Google Fonts <link>s, @font-face names, then the most common font-family declarations
  const fonts = new Map<string, number>()
  const bump = (name: string, weight = 1) => {
    const clean = name.replace(/["']/g, '').trim()
    if (!clean || /^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica( Neue)?|Arial|Times New Roman|cursive|fantasy|ui-sans-serif|ui-serif)$/i.test(clean)) return
    fonts.set(clean, (fonts.get(clean) || 0) + weight)
  }
  const gfRegex = /fonts\.googleapis\.com\/css2?\?([^"']+)/gi
  let gf: RegExpExecArray | null
  while ((gf = gfRegex.exec(html)) !== null) {
    const famRe = /family=([^&]+)/g
    let fp: RegExpExecArray | null
    while ((fp = famRe.exec(gf[1])) !== null) {
      for (const fam of decodeURIComponent(fp[1]).split('|')) bump(fam.split(':')[0].replace(/\+/g, ' '), 5)
    }
  }
  const ffRegex = /@font-face\s*{[^}]*font-family\s*:\s*([^;}]+)/gi
  let ff: RegExpExecArray | null
  while ((ff = ffRegex.exec(html)) !== null) bump(ff[1], 4)
  const famRegex = /font-family\s*:\s*([^;}"']+)/gi
  let fm: RegExpExecArray | null
  while ((fm = famRegex.exec(html)) !== null) bump(fm[1].split(',')[0], 1)
  result.fontFamilies = [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f)

  // Logo candidates (ordered by confidence)
  const logos: string[] = []
  const pushLogo = (u?: string | null) => { if (u) { const r = resolveUrl(u, url); if (!r.startsWith('data:') && !logos.includes(r)) logos.push(r) } }
  const logoImg = /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi
  let li: RegExpExecArray | null
  while ((li = logoImg.exec(html)) !== null && logos.length < 6) {
    const tag = li[0]
    if (/logo|brand|wordmark/i.test(tag)) pushLogo(li[1])
  }
  const touchIcon = html.match(/<link[^>]*rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)
  pushLogo(touchIcon?.[1])
  const svgLogo = html.match(/<a[^>]*class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*>[\s\S]{0,400}?<img[^>]+src=["']([^"']+)["']/i)
  pushLogo(svgLogo?.[1])
  result.logoCandidates = logos

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
