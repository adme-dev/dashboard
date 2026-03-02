/**
 * Generate banner layouts from a URL.
 * POST /api/agency/banner-studio/generate-from-url
 * Body: { url: string, formats: string[] }
 * Returns: { scraped, layouts, assetUrls }
 */

import { requireAuth } from '~~/server/utils/auth'
import { scrapeUrl } from '~~/server/utils/urlScraper'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { edgeGenerate } from '~~/server/utils/edgeAi'

interface BannerLayerPartial {
  id?: number
  type: string
  name: string
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  opacity: number
  animIn: string
  startTime: number
  animInDur: number
  endTime: number
  locked?: boolean
  src?: string
  fit?: string
  bgColor?: string
  fillColor?: string
  text?: string
  fontSize?: number
  fontWeight?: number
  fontFamily?: string
  color?: string
  textColor?: string
  textTransform?: string
  letterSpacing?: string
  lineHeight?: number
  textAlign?: string
  borderRadius?: number
  paddingH?: number
  paddingV?: number
  ease?: string
}

interface GeneratedLayout {
  layers: BannerLayerPartial[]
}

// Format dimensions lookup (server-side copy — avoids importing frontend utils)
const FORMAT_DIMS: Record<string, { w: number; h: number }> = {
  mrec: { w: 300, h: 250 }, leader: { w: 728, h: 90 }, half: { w: 300, h: 600 },
  wsky: { w: 160, h: 600 }, billboard: { w: 970, h: 250 }, mob_ban: { w: 320, h: 50 },
  mob_lg: { w: 320, h: 100 }, fb_feed: { w: 1200, h: 628 }, fb_sq: { w: 1080, h: 1080 },
  fb_story: { w: 1080, h: 1920 }, fb_cover: { w: 820, h: 312 }, ig_sq: { w: 1080, h: 1080 },
  ig_port: { w: 1080, h: 1350 }, ig_story: { w: 1080, h: 1920 }, ig_land: { w: 1080, h: 566 },
  tt_feed: { w: 1080, h: 1920 }, tt_sq: { w: 1080, h: 1080 }, tt_land: { w: 1280, h: 720 },
  li_feed: { w: 1200, h: 627 }, li_sq: { w: 1200, h: 1200 }, li_story: { w: 1080, h: 1920 },
  li_carousel: { w: 1080, h: 1080 },
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const { url, formats } = await readBody<{ url: string; formats: string[] }>(event)

  if (!url || typeof url !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'URL is required' })
  }

  // Validate URL
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }

  if (!formats?.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one format is required' })
  }

  // 1. Scrape the URL
  const scraped = await scrapeUrl(url)

  // 2. Download and upload images (OG image + first 2 body images)
  const imagesToDownload = [
    scraped.ogImage,
    ...scraped.images.slice(0, 2),
  ].filter((u): u is string => !!u)

  const assetUrls: string[] = []
  for (const imgUrl of imagesToDownload.slice(0, 3)) {
    try {
      const imgResponse = await fetch(imgUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgencyBot/1.0)' },
      })
      if (!imgResponse.ok) continue
      const contentType = imgResponse.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) continue
      const arrayBuffer = await imgResponse.arrayBuffer()
      if (arrayBuffer.byteLength > 10 * 1024 * 1024) continue // Skip >10MB
      const buffer = Buffer.from(arrayBuffer)
      const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
      const fileName = `scraped-${Date.now()}.${ext}`
      const result = await uploadBannerAsset(buffer, fileName, contentType, user.id)
      assetUrls.push(result.url)
    } catch {
      // Skip failed downloads
    }
  }

  // 3. Generate ad copy with AI (or fallback to scraped content)
  let headline = scraped.headline || scraped.title || 'Your Headline'
  let subheadline = scraped.description || ''
  let cta = scraped.ctaTexts[0] || 'Learn More'

  try {
    const aiPrompt = `Given this webpage data, write ad banner copy:
Title: ${scraped.title || ''}
Headline: ${scraped.headline || ''}
Description: ${scraped.description || ''}
Brand: ${scraped.brandName || ''}
CTAs found: ${scraped.ctaTexts.join(', ') || 'none'}

Return ONLY valid JSON: {"headline":"max 6 words","subheadline":"max 12 words","cta":"max 3 words"}`

    const aiResult = await edgeGenerate(event, aiPrompt, {
      systemPrompt: 'You are an ad copywriter. Return only valid JSON, no markdown.',
      maxTokens: 100,
      temperature: 0.5,
    })

    if (aiResult) {
      try {
        // Extract JSON from response (may contain markdown)
        const jsonMatch = aiResult.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.headline) headline = parsed.headline
          if (parsed.subheadline) subheadline = parsed.subheadline
          if (parsed.cta) cta = parsed.cta
        }
      } catch {
        // Use scraped content as fallback
      }
    }
  } catch {
    // AI unavailable — use scraped content
  }

  // 4. Build layouts for each format
  const layouts: Record<string, GeneratedLayout> = {}

  const bgImageUrl = assetUrls[0] || undefined
  const accentColor = scraped.themeColor || scraped.primaryColors[0] || '#e8c84a'

  for (const formatKey of formats) {
    const fmt = FORMAT_DIMS[formatKey]
    if (!fmt) continue
    layouts[formatKey] = buildLayout(fmt.w, fmt.h, {
      headline,
      subheadline,
      cta,
      brandName: scraped.brandName || '',
      bgImageUrl,
      accentColor,
    })
  }

  return { scraped, layouts, assetUrls }
})

function ensureHex6(hex: string): string {
  // Convert 3-char hex to 6-char: #abc → #aabbcc
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  }
  return hex
}

function buildLayout(
  w: number,
  h: number,
  opts: {
    headline: string
    subheadline: string
    cta: string
    brandName: string
    bgImageUrl?: string
    accentColor: string
  }
): GeneratedLayout {
  const scale = (base: number) => Math.round(base * (w / 300))
  const layers: BannerLayerPartial[] = []
  let id = 1

  // Background layer
  if (opts.bgImageUrl) {
    layers.push({
      id: id++,
      type: 'bg',
      name: 'Background',
      src: opts.bgImageUrl,
      fit: 'cover',
      x: 0,
      y: 0,
      w,
      h,
      zIndex: 0,
      opacity: 1,
      animIn: 'none',
      startTime: 0,
      animInDur: 0.8,
      endTime: 4,
      locked: true,
    })
    // Dark overlay for text readability
    layers.push({
      id: id++,
      type: 'rect',
      name: 'Overlay',
      fillColor: 'rgba(0,0,0,0.45)',
      x: 0,
      y: 0,
      w,
      h,
      zIndex: 1,
      opacity: 1,
      animIn: 'fadeIn',
      startTime: 0.1,
      animInDur: 1.0,
      endTime: 4,
    })
  } else {
    layers.push({
      id: id++,
      type: 'bg',
      name: 'Background',
      bgColor: '#0a0a10',
      x: 0,
      y: 0,
      w,
      h,
      zIndex: 0,
      opacity: 1,
      animIn: 'none',
      startTime: 0,
      animInDur: 0.8,
      endTime: 4,
      locked: true,
    })
  }

  // Brand name (top-left, small)
  if (opts.brandName) {
    layers.push({
      id: id++,
      type: 'text',
      name: 'Brand',
      text: opts.brandName.toUpperCase(),
      fontSize: Math.max(8, scale(9)),
      fontWeight: 700,
      fontFamily: 'Barlow Condensed',
      color: `${ensureHex6(opts.accentColor)}99`,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      lineHeight: 1,
      textAlign: 'left',
      x: Math.round(w * 0.05),
      y: Math.round(h * 0.05),
      w: Math.round(w * 0.6),
      h: 20,
      zIndex: 10,
      opacity: 1,
      animIn: 'fadeIn',
      startTime: 0.3,
      animInDur: 0.4,
      endTime: 4,
    })
  }

  // Headline (top-third area)
  layers.push({
    id: id++,
    type: 'text',
    name: 'Headline',
    text: opts.headline.toUpperCase(),
    fontSize: Math.max(20, scale(32)),
    fontWeight: 900,
    fontFamily: 'Barlow Condensed',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: '-0.01em',
    lineHeight: 0.95,
    textAlign: 'left',
    x: Math.round(w * 0.05),
    y: Math.round(h * 0.2),
    w: Math.round(w * 0.9),
    h: Math.round(h * 0.25),
    zIndex: 11,
    opacity: 1,
    animIn: 'slideL',
    startTime: 0.5,
    animInDur: 0.55,
    endTime: 4,
    ease: 'power3.out',
  })

  // Subheadline (mid area)
  if (opts.subheadline) {
    layers.push({
      id: id++,
      type: 'text',
      name: 'Subheadline',
      text: opts.subheadline,
      fontSize: Math.max(10, scale(14)),
      fontWeight: 400,
      fontFamily: 'Barlow',
      color: 'rgba(255,255,255,0.7)',
      textTransform: 'none',
      letterSpacing: '0',
      lineHeight: 1.4,
      textAlign: 'left',
      x: Math.round(w * 0.05),
      y: Math.round(h * 0.5),
      w: Math.round(w * 0.8),
      h: Math.round(h * 0.15),
      zIndex: 11,
      opacity: 1,
      animIn: 'slideL',
      startTime: 0.7,
      animInDur: 0.5,
      endTime: 4,
      ease: 'power2.out',
    })
  }

  // CTA button (bottom area)
  layers.push({
    id: id++,
    type: 'button',
    name: 'CTA',
    text: opts.cta.toUpperCase(),
    fontSize: Math.max(10, scale(13)),
    fontWeight: 800,
    fontFamily: 'Barlow Condensed',
    bgColor: opts.accentColor,
    textColor: '#000000',
    borderRadius: 2,
    paddingH: 14,
    paddingV: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    x: Math.round(w * 0.05),
    y: Math.round(h * 0.75),
    w: Math.round(w * 0.5),
    h: Math.max(26, scale(28)),
    zIndex: 12,
    opacity: 1,
    animIn: 'slideU',
    startTime: 1.0,
    animInDur: 0.45,
    endTime: 4,
    ease: 'back.out(1.7)',
  })

  return { layers }
}
