const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface MetaSourcePostImageInput {
  platform: string
  sourcePostId: string
  accessToken: string
  fetcher?: Fetcher
}

export interface MetaSourcePostImage {
  body: ArrayBuffer
  contentType: string
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function facebookImageUrl(payload: Record<string, unknown>): string | null {
  const direct = readString(payload.full_picture)
  if (direct) return direct
  const attachments = readRecord(payload.attachments)
  const first = Array.isArray(attachments?.data) ? readRecord(attachments.data[0]) : null
  const media = readRecord(first?.media)
  const image = readRecord(media?.image)
  return readString(image?.src) ?? readString(media?.source)
}

function instagramImageUrl(payload: Record<string, unknown>): string | null {
  return readString(payload.media_url) ?? readString(payload.thumbnail_url)
}

export function isAllowedMetaImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    const hostname = url.hostname.toLowerCase()
    return hostname === 'fbcdn.net'
      || hostname.endsWith('.fbcdn.net')
      || hostname === 'cdninstagram.com'
      || hostname.endsWith('.cdninstagram.com')
  } catch {
    return false
  }
}

export async function fetchMetaSourcePostImage(input: MetaSourcePostImageInput): Promise<MetaSourcePostImage | null> {
  const platform = input.platform.trim().toLowerCase()
  if (!['facebook', 'instagram'].includes(platform) || !input.sourcePostId || !input.accessToken) return null

  const fetcher = input.fetcher ?? fetch
  const graphUrl = new URL(`${GRAPH_API_BASE}/${encodeURIComponent(input.sourcePostId)}`)
  graphUrl.searchParams.set('fields', platform === 'facebook'
    ? 'full_picture,attachments{media,type}'
    : 'media_url,thumbnail_url,media_type')
  graphUrl.searchParams.set('access_token', input.accessToken)

  try {
    const graphResponse = await fetcher(graphUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000)
    })
    if (!graphResponse.ok) return null
    const payload = readRecord(await graphResponse.json())
    if (!payload) return null

    const imageUrl = platform === 'facebook'
      ? facebookImageUrl(payload)
      : instagramImageUrl(payload)
    if (!imageUrl || !isAllowedMetaImageUrl(imageUrl)) return null

    const imageResponse = await fetcher(imageUrl, {
      headers: { accept: 'image/*' },
      redirect: 'error',
      signal: AbortSignal.timeout(12_000)
    })
    if (!imageResponse.ok) return null

    const contentType = imageResponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return null
    const declaredSize = Number(imageResponse.headers.get('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) return null

    const body = await imageResponse.arrayBuffer()
    if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) return null
    return { body, contentType }
  } catch {
    return null
  }
}
