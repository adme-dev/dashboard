/**
 * POST /api/agency/banner-studio/brand-kits/extract { url, clientId? }
 * Scrape a website for brand signals and return a draft kit for the user to confirm.
 * Logo candidates are mirrored into R2 so the kit doesn't depend on the third-party host.
 */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { scrapeUrl } from '~~/server/utils/urlScraper'
import { queryOne } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { uploadBannerAsset, createBannerAssetStorageKey, createBannerAssetId, bannerAssetDeliveryUrl, deleteBannerFile } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { executeGodModeBannerAssetUpload } from '~~/server/utils/banner/godModeAssetUpload'

function toHex6(c: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(ch => ch + ch).join('') : m[1]
  return '#' + h.toLowerCase()
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const body = await readBody(event) as { url?: string }
  const raw = (body?.url || '').trim()
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'url is required' })
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  const page = await scrapeUrl(url) // SSRF-guarded inside
  if (!page.title && !page.primaryColors.length && !page.logoCandidates.length) {
    throw createError({ statusCode: 422, statusMessage: 'Could not read that page — check the URL is public' })
  }

  // Colours: theme-color first (most intentional), then by frequency; assign roles by luminance
  const seen = new Set<string>()
  const hexes: string[] = []
  for (const c of [page.themeColor, ...page.primaryColors]) {
    const h = c ? toHex6(c) : null
    if (h && !seen.has(h)) { seen.add(h); hexes.push(h) }
  }
  const sorted = [...hexes]
  const dark = sorted.filter(h => luminance(h) < 0.25)
  const light = sorted.filter(h => luminance(h) > 0.85)
  const mid = sorted.filter(h => !dark.includes(h) && !light.includes(h))
  const colors: { role: string, hex: string }[] = []
  const take = (arr: string[], role: string) => { const h = arr.shift(); if (h) colors.push({ role, hex: h }) }
  take(mid, 'primary')
  take(mid, 'accent')
  take(light.length ? light : dark, 'background')
  take(dark.length ? dark : mid, 'text')
  take(mid, 'secondary')
  for (const h of [...mid, ...dark, ...light]) if (!colors.some(c => c.hex === h) && colors.length < 8) colors.push({ role: 'extra', hex: h })

  const fonts = page.fontFamilies.slice(0, 2).map((family, i) => ({
    role: i === 0 ? 'heading' : 'body', family, weights: [400, 700]
  }))

  // Mirror up to 2 logo candidates through the normal asset pipeline (R2 + signed delivery URL + banner_assets row)
  const logos: { name: string, url: string, r2Key: string }[] = []
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  const host = new URL(url).hostname.replace(/^www\./, '')
  for (const cand of page.logoCandidates.slice(0, 3)) {
    if (logos.length >= 2) break
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(cand, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (XeroFlow brand extractor)' } })
      clearTimeout(t)
      const type = (res.headers.get('content-type') || '').split(';')[0].trim()
      if (!res.ok || !type.startsWith('image/')) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) continue
      const ext = type.includes('svg') ? 'svg' : type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg'
      const fileName = `${host}-logo-${logos.length + 1}.${ext}`
      const assetId = createBannerAssetId()
      const r2Key = createBannerAssetStorageKey(fileName, user.id)
      const createdAt = new Date().toISOString()
      const stored = await executeGodModeBannerAssetUpload(event, {
        assetId,
        r2Key,
        result: (st, identity) => ({
          id: identity.assetId, name: fileName, mimeType: type, fileSize: st.size, r2Key: identity.r2Key,
          url: st.url, thumbnailUrl: null, tags: ['logo', 'brand-kit'], uploadedBy: user.id, createdAt
        }),
        deleteFile: async key => await deleteBannerFile(key, nativeUpload?.bucket),
        uploadFile: async (key, effectiveAssetId = assetId) => {
          const delivery = signingSecret ? await bannerAssetDeliveryUrl(effectiveAssetId, getAppUrl(event), signingSecret) : undefined
          return nativeUpload
            ? await uploadBannerAsset(buffer, fileName, type, user.id, key, { bucket: nativeUpload.bucket, assetUrl: delivery! })
            : delivery
              ? await uploadBannerAsset(buffer, fileName, type, user.id, key, undefined, delivery)
              : await uploadBannerAsset(buffer, fileName, type, user.id, key)
        },
        insertAsset: async (db, st, result) => {
          if (!result) throw new Error('Banner asset insert identity is unavailable')
          const sql = `INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                       RETURNING id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags, uploaded_by AS "uploadedBy", created_at AS "createdAt"`
          const params = [result.id, result.name, result.mimeType, st.size, st.key, st.url, result.tags, result.uploadedBy, result.createdAt]
          const row = db ? (await db.query(sql, params)).rows[0] : await queryOne(sql, params)
          if (!row) throw new Error('Banner asset insert did not return a row')
          return row
        }
      })
      logos.push({ name: `${page.brandName || host} logo`, url: stored.url, r2Key: stored.r2Key })
    } catch {
      // best effort — a failed candidate just isn't offered
    }
  }

  return {
    name: page.brandName || page.title || new URL(url).hostname,
    sourceUrl: url,
    colors,
    fonts,
    logos
  }
})
