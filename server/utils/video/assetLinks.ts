import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'

export interface VideoAssetTokenPayload { assetId: string }

function getSecret(): string {
  const s = process.env.RENDER_LINK_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') throw new Error('RENDER_LINK_SECRET is not set')
  return 'dev-insecure-render-link-secret'
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function signVideoAssetToken(payload: VideoAssetTokenPayload): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = b64urlEncode(await hmac(body))
  return `${body}.${sig}`
}

export async function verifyVideoAssetToken(token: string): Promise<VideoAssetTokenPayload | null> {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: Uint8Array
  let given: Uint8Array
  try {
    expected = await hmac(body)
    given = b64urlDecode(sig)
  } catch {
    return null
  }
  if (!timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    return payload && typeof payload.assetId === 'string' ? { assetId: payload.assetId } : null
  } catch {
    return null
  }
}

export async function videoAssetPublicUrl(assetId: string, baseUrl: string): Promise<string> {
  const token = await signVideoAssetToken({ assetId })
  return `${baseUrl.replace(/\/$/, '')}/api/public/video-assets/${token}`
}

export async function resolveVideoAssetDownloadUrl(assetId: string): Promise<string | null> {
  const row = await queryOne(`SELECT * FROM video_assets WHERE id = $1`, [assetId])
  if (!row) return null
  const asset = mapVideoAssetRow(row)
  if (!asset.r2Key) return null
  return isStorageConfigured()
    ? (getPublicUrl(asset.r2Key) ?? await getPresignedDownloadUrl(asset.r2Key, 60 * 60))
    : `/api/_uploads/${asset.r2Key}`
}
