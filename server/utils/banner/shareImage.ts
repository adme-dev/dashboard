import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { preferredBannerPreviewKey } from '~~/app/utils/banner-library'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'
import type { ArtboardState } from '~~/app/types/banner-studio'
import type { ExportCustomFont } from '~~/app/utils/banner-html-builder'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'

/** Recheck the live link before reading even a previously cached artwork image. */
export async function bannerShareImage(event: H3Event): Promise<Response> {
  const { project, fonts } = await loadPublicBannerShare(event)
  const canvas: Record<string, ArtboardState> = typeof project.canvasData === 'string'
    ? JSON.parse(project.canvasData)
    : project.canvasData as Record<string, ArtboardState>
  const key = preferredBannerPreviewKey(canvas)
  const format = key && resolveBannerFormat(key)
  const board = key && canvas[key]
  if (!key || !format || !board || format.w > 4000 || format.h > 4000) {
    throw createError({ statusCode: 404, statusMessage: 'Artwork preview unavailable' })
  }
  const env = event.context.cloudflare?.env
  const bucket = env?.MEDIA_BUCKET
  if (!bucket?.get || !bucket.put) throw createError({ statusCode: 503, statusMessage: 'Artwork preview storage unavailable' })
  const revision = createHash('sha256').update(JSON.stringify({ canvas: board, fonts, version: 1 })).digest('hex')
  const imageKey = `banner-share-previews/${project.id}/${revision}.jpg`
  const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
  const cached = await bucket.get(imageKey)
  if (cached) return new Response(cached.body, { headers })
  const renderer = env?.BANNER_SHARE_IMAGES as unknown as { fetch: (request: Request) => Promise<Response> } | undefined
  if (!renderer?.fetch) throw createError({ statusCode: 503, statusMessage: 'Artwork preview rendering unavailable' })
  await enforceRateLimit(event, { key: `banner-share-image:${project.id}`, limit: 3, windowSeconds: 60, failureMode: 'closed' })
  const customFonts: ExportCustomFont[] = fonts.map(font => ({
    id: font.id, family: font.name, url: font.url,
    weight: Number(font.tags.find(tag => tag.startsWith('weight:'))?.slice(7) || 400),
    format: font.tags.find(tag => tag.startsWith('format:'))?.slice(7) || 'woff2'
  }))
  const time = Math.min(3, (board.playback?.duration || 5) / 2)
  const scale = Math.min(1, 1200 / Math.max(format.w, format.h))
  const width = Math.max(1, Math.round(format.w * scale)), height = Math.max(1, Math.round(format.h * scale))
  const html = buildBannerHTML(key, board.layers.filter(layer => layer.type !== 'audio'), {
    pausedAt: time, playback: board.playback, bgColor: board.bgColor, customFonts,
    baseUrl: 'https://app.xeroflow.io'
  }).replace('</head>', `<style>body{width:${width}px;height:${height}px;overflow:hidden}.ad{transform:scale(${scale});transform-origin:top left}</style></head>`)
  if (html.length > 2 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Artwork preview is too large' })
  const response = await renderer.fetch(new Request('https://banner-share-images/screenshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, width, height, time })
  }))
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) {
    throw createError({ statusCode: 503, statusMessage: 'Artwork preview could not be rendered' })
  }
  const image = await response.arrayBuffer()
  if (image.byteLength > 3 * 1024 * 1024) throw createError({ statusCode: 503, statusMessage: 'Artwork preview could not be stored' })
  await bucket.put(imageKey, image, { httpMetadata: { contentType: 'image/jpeg' } })
  return new Response(image, { headers })
}
