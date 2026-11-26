import { resolveSlides, slideRanges } from '~~/app/utils/banner-slides'
import { estimateBannerDuration } from '~~/app/utils/banner-render-runtime'
import { bannerPosterTime } from '~~/shared/bannerPosterTime'
import { createHash } from 'node:crypto'
import { getQuery } from 'h3'
import type { H3Event } from 'h3'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { preferredBannerPreviewKey } from '~~/app/utils/banner-library'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'
import type { ArtboardState } from '~~/app/types/banner-studio'
import type { ExportCustomFont } from '~~/app/utils/banner-html-builder'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'

/** Recheck the live link before reading even a previously cached artwork image. */
export async function bannerShareImage(event: H3Event, load = () => loadPublicBannerShare(event), gallery = false, slideExport?: { index: number, scale: number, quality: number }): Promise<Response> {
  const { project, fonts } = await load()
  const canvas: Record<string, ArtboardState> = typeof project.canvasData === 'string'
    ? JSON.parse(project.canvasData)
    : project.canvasData as Record<string, ArtboardState>
  const { formatKey } = getQuery(event)
  if (formatKey !== undefined && typeof formatKey !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Choose one saved artwork size' })
  }
  const key = formatKey === undefined ? preferredBannerPreviewKey(canvas) : formatKey
  const format = key && resolveBannerFormat(key)
  const board = key && canvas[key]
  if (!key || !format || !board || (gallery && !board.layers?.length) || format.w > 4000 || format.h > 4000) {
    throw createError({ statusCode: 404, statusMessage: 'Artwork preview unavailable' })
  }
  const slides = gallery || slideExport ? resolveSlides(board) : []
  const galleryFirstSlide = gallery && (board.slides?.length || slides.length > 1)
  const slide = slideExport ? slideRanges(slides)[slideExport.index] : galleryFirstSlide ? slideRanges(slides)[0] : undefined
  if (slideExport && !slide) throw createError({ statusCode: 400, statusMessage: 'Slide unavailable in the selected size' })
  const env = event.context.cloudflare?.env
  const bucket = env?.MEDIA_BUCKET
  if (!bucket?.get || !bucket.put) throw createError({ statusCode: 503, statusMessage: 'Artwork preview storage unavailable' })
  const revision = createHash('sha256').update(JSON.stringify({ key, canvas: board, fonts, slideExport, version: galleryFirstSlide ? 6 : 5 })).digest('hex')
  const proofKey = `banner-share-previews/${project.id}/${revision}.jpg`
  const imageKey = slideExport ? `banner-slide-images/${project.id}/${revision}.jpg` : gallery ? `banner-gallery-posters/${project.id}/${revision}.jpg` : proofKey
  const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
  // Reuse a finished proof if the gallery does not have its own smaller still yet.
  const cached = await bucket.get(imageKey) || (gallery && !galleryFirstSlide && await bucket.get(proofKey))
  if (cached) return new Response(cached.body, { headers })
  const renderer = env?.BANNER_SHARE_IMAGES as unknown as { fetch: (request: Request) => Promise<Response> } | undefined
  if (!renderer?.fetch) throw createError({ statusCode: 503, statusMessage: 'Artwork preview rendering unavailable' })
  await enforceRateLimit(event, { key: `${slideExport ? 'banner-slide-export' : 'banner-share-image'}:${project.id}`, limit: slideExport ? 150 : 3, windowSeconds: 60, failureMode: 'closed' })
  const customFonts: ExportCustomFont[] = fonts.map(font => ({
    id: font.id, family: font.name, url: font.url,
    weight: Number(font.tags.find(tag => tag.startsWith('weight:'))?.slice(7) || 400),
    format: font.tags.find(tag => tag.startsWith('format:'))?.slice(7) || 'woff2'
  }))
  const time = slide ? (slide.start + slide.end) / 2 : bannerPosterTime(board.playback?.duration || estimateBannerDuration(board.layers), board.posterTime, board.layers)
  const scale = slideExport?.scale ?? Math.min(1, (gallery ? 480 : 1200) / Math.max(format.w, format.h))
  const width = Math.max(1, Math.round(format.w * scale)), height = Math.max(1, Math.round(format.h * scale))
  const html = buildBannerHTML(key, board.layers.filter(layer => layer.type !== 'audio'), {
    pausedAt: time, playback: board.playback, bgColor: board.bgColor, customFonts,
    baseUrl: 'https://app.xeroflow.io'
  }).replace('</head>', `<style>body{width:${width}px;height:${height}px;overflow:hidden}.ad{transform:scale(${scale});transform-origin:top left}</style></head>`)
  if (html.length > 2 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Artwork preview is too large' })
  const response = await renderer.fetch(new Request(slideExport ? 'https://banner-share-images/export-slide' : 'https://banner-share-images/screenshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, width, height, time, quality: slideExport?.quality })
  }))
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) {
    throw createError({ statusCode: 503, statusMessage: 'Artwork preview could not be rendered' })
  }
  const image = await response.arrayBuffer()
  if (image.byteLength > (slideExport ? 20 : 3) * 1024 * 1024) throw createError({ statusCode: 503, statusMessage: 'Artwork preview could not be stored' })
  await bucket.put(imageKey, image, { httpMetadata: { contentType: 'image/jpeg' } })
  return new Response(image, { headers })
}
