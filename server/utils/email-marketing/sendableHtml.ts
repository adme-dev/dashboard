import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import {
  EMAIL_IMAGE_ASSET_MAX_BYTES,
  emailImageAssetStorageName,
  isAllowedEmailImageMime,
  isWithinEmailImageAssetLimit
} from '~~/app/utils/edmImageAssets'

const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi
const MEDIA_ATTR_RE = /\b(src|background)=(["'])([^"']+)\2/gi
const CSS_URL_RE = /url\((\s*['"]?)([^'")]+)(['"]?\s*)\)/gi
const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp)(?:[?#].*)?$/i

export interface SendableFetchedAsset {
  buffer: Buffer
  mimeType: string
  fileName: string
}

export interface PrepareSendableHtmlWithMirroredAssetsOptions {
  appUrl: string
  userId: string
  fetchAsset?: (url: string) => Promise<SendableFetchedAsset>
  uploadAsset?: (asset: SendableFetchedAsset & { sourceUrl: string, userId: string }) => Promise<string>
  mirrorExternalAssets?: boolean
}

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

function isUntouchableMediaUrl(value: string): boolean {
  const trimmed = value.trim()
  return !trimmed
    || /^(?:cid:|data:image\/|#|\{\{)/i.test(trimmed)
    || trimmed.startsWith('//')
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const name = parsed.pathname.split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : 'email-image'
  } catch {
    return 'email-image'
  }
}

function mimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

function contentTypeWithoutParams(value: string | null): string {
  return (value || '').split(';')[0]?.trim().toLowerCase() || ''
}

function shouldMirrorMediaUrl(url: string, appUrl: string, mirrorExternalAssets: boolean): boolean {
  if (isUntouchableMediaUrl(url)) return false

  let parsed: URL
  try {
    parsed = new URL(url, appUrl)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  if (!IMAGE_EXT_RE.test(parsed.pathname)) return false
  if (parsed.hostname.endsWith('.r2.dev')) return false

  const r2PublicUrl = process.env.R2_PUBLIC_URL
  if (r2PublicUrl && parsed.href.startsWith(r2PublicUrl)) return false

  try {
    const appOrigin = new URL(appUrl).origin
    if (parsed.origin === appOrigin) return true
  } catch {
    // If appUrl is invalid, external mirroring is the only safe signal.
  }

  if (parsed.protocol === 'http:') return true
  return mirrorExternalAssets
}

function collectMediaUrls(html: string, appUrl: string, mirrorExternalAssets: boolean): string[] {
  const urls = new Set<string>()

  html.replace(MEDIA_ATTR_RE, (_match, _attr: string, _quote: string, value: string) => {
    const absolute = absoluteUrl(value, appUrl)
    if (shouldMirrorMediaUrl(absolute, appUrl, mirrorExternalAssets)) urls.add(absolute)
    return _match
  })
  html.replace(CSS_URL_RE, (_match, _prefix: string, value: string) => {
    const absolute = absoluteUrl(value, appUrl)
    if (shouldMirrorMediaUrl(absolute, appUrl, mirrorExternalAssets)) urls.add(absolute)
    return _match
  })

  return [...urls]
}

async function defaultFetchAsset(url: string): Promise<SendableFetchedAsset> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch email asset ${url}: ${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength && !isWithinEmailImageAssetLimit(contentLength)) {
    throw new Error(`Email asset ${url} exceeds ${EMAIL_IMAGE_ASSET_MAX_BYTES} bytes`)
  }

  const fileName = fileNameFromUrl(url)
  const mimeType = contentTypeWithoutParams(response.headers.get('content-type')) || mimeFromFileName(fileName)
  if (!isAllowedEmailImageMime(mimeType)) {
    throw new Error(`Email asset ${url} has unsupported content type ${mimeType}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!isWithinEmailImageAssetLimit(buffer.length)) {
    throw new Error(`Email asset ${url} exceeds ${EMAIL_IMAGE_ASSET_MAX_BYTES} bytes`)
  }

  return { buffer, mimeType, fileName }
}

async function defaultUploadAsset(
  asset: SendableFetchedAsset & { userId: string }
): Promise<string> {
  const storageName = emailImageAssetStorageName(asset.fileName)
  const uploaded = await uploadBannerAsset(asset.buffer, storageName, asset.mimeType, asset.userId)
  return uploaded.url
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

export async function prepareSendableHtmlWithMirroredAssets(
  html: string,
  options: PrepareSendableHtmlWithMirroredAssetsOptions
): Promise<string> {
  const deduped = dedupeExactStyleTags(html)
  const mirrorExternalAssets = options.mirrorExternalAssets ?? true
  const urls = collectMediaUrls(deduped, options.appUrl, mirrorExternalAssets)
  const replacements = new Map<string, string>()
  const fetchAsset = options.fetchAsset || defaultFetchAsset
  const uploadAsset = options.uploadAsset || defaultUploadAsset

  for (const url of urls) {
    const fetched = await fetchAsset(url)
    const uploadedUrl = await uploadAsset({
      ...fetched,
      sourceUrl: url,
      userId: options.userId
    })
    replacements.set(url, absoluteUrl(uploadedUrl, options.appUrl))
  }

  return deduped
    .replace(MEDIA_ATTR_RE, (_match, attr: string, quote: string, value: string) => {
      const absolute = absoluteUrl(value, options.appUrl)
      return `${attr}=${quote}${replacements.get(absolute) || absolute}${quote}`
    })
    .replace(CSS_URL_RE, (_match, prefix: string, value: string, suffix: string) => {
      const absolute = absoluteUrl(value, options.appUrl)
      return `url(${prefix}${replacements.get(absolute) || absolute}${suffix})`
    })
}
