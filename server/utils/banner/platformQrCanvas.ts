import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { requireQrClientAccess } from '~~/server/utils/qr/permissions'
import { resolveBannerAssetDelivery } from './assetDelivery'
import { bannerPlatformQrSchema, type BannerPlatformQr } from '../../../shared/bannerQr'
import { assertManagedQrCanvas, assertManagedQrTransition } from '../../../shared/bannerQrProtection'

const ATTESTATION_PREFIX = 'platform-qr-attestation:v1:'
type QrAssetIdentity = Pick<BannerPlatformQr, 'assetId' | 'clientId' | 'qrCodeId' | 'code' | 'sha256'>

/** Ordinary asset edits can retain a server stamp but cannot add, replace or erase it. */
export function preservePlatformQrAssetAttestations(existing: unknown, requested: unknown): string[] {
  if (!Array.isArray(requested) || requested.some(tag => typeof tag !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Asset tags must be an array of strings' })
  }
  const reserved = (tag: unknown): tag is string => typeof tag === 'string' && tag.startsWith('platform-qr-attestation:')
  const retained = new Set(Array.isArray(existing) ? existing.filter(reserved) : [])
  if (requested.some(tag => reserved(tag) && !retained.has(tag))) {
    throw createError({ statusCode: 400, statusMessage: 'Managed QR asset attestation tags are reserved for server rendering' })
  }
  return [...requested.filter(tag => !reserved(tag)), ...retained]
}

/** Domain-separated proof of server rendering; ordinary editable asset tags are not proof. */
export function signPlatformQrAssetAttestation(identity: QrAssetIdentity, secret: string): string {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Managed QR asset verification is unavailable' })
  }
  const payload = JSON.stringify([
    'xeroflow:banner-platform-qr:v1', identity.assetId, identity.clientId,
    identity.qrCodeId, identity.code, identity.sha256
  ])
  return ATTESTATION_PREFIX + createHmac('sha256', secret).update(payload).digest('hex')
}

function hasAttestation(tags: unknown, identity: QrAssetIdentity, secret: string): boolean {
  if (!Array.isArray(tags)) return false
  const expected = Buffer.from(signPlatformQrAssetAttestation(identity, secret).slice(ATTESTATION_PREFIX.length), 'hex')
  return tags.some((tag) => {
    if (typeof tag !== 'string' || !tag.startsWith(ATTESTATION_PREFIX)) return false
    const digest = tag.slice(ATTESTATION_PREFIX.length)
    return /^[a-f0-9]{64}$/.test(digest) && timingSafeEqual(Buffer.from(digest, 'hex'), expected)
  })
}

interface QrRecord { id: string, client_id: string, code: string, is_active: boolean }
interface AssetRecord { id: string, client_id: string | null, mime_type: string, url: string, r2_key: string, tags: unknown }

/** Validate the candidate before project snapshots or writes, using the fresh saved canvas. */
export async function validateBannerPlatformQrCanvas(
  event: H3Event,
  before: unknown,
  after: unknown,
  clientId: string | null
): Promise<void> {
  try {
    assertManagedQrCanvas(after)
    assertManagedQrTransition(before, after, { allowRemoval: true })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Managed QR artwork must retain its metadata, identity, opaque image and quiet zone; remove the layer explicitly to replace it'
    })
  }

  const managed: Array<{ src: unknown, metadata: BannerPlatformQr }> = []
  if (after && typeof after === 'object' && !Array.isArray(after)) {
    for (const board of Object.values(after)) {
      if (!board || typeof board !== 'object' || !Array.isArray(board.layers)) continue
      for (const layer of board.layers) {
        if (layer?.platformQr != null) managed.push({ src: layer.src, metadata: bannerPlatformQrSchema.parse(layer.platformQr) })
      }
    }
  }
  // Legacy projects without managed QR do not require QR permissions or storage configuration.
  if (!managed.length) return
  if (!clientId || managed.some(layer => layer.metadata.clientId !== clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'Remove managed QR codes before changing the project client, or choose a QR code belonging to that client' })
  }
  await requireQrClientAccess(event, clientId)
  const { signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret || Buffer.byteLength(signingSecret, 'utf8') < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Managed QR asset verification is unavailable' })
  }

  const qrRecords = new Map<string, QrRecord>()
  const assetRecords = new Map<string, AssetRecord>()
  for (const { src, metadata } of managed) {
    let qr = qrRecords.get(metadata.qrCodeId)
    if (!qr) {
      qr = await queryOneFresh<QrRecord>(
        'SELECT id, client_id, code, is_active FROM qr_codes WHERE id = $1', [metadata.qrCodeId]
      ) ?? undefined
      if (!qr) throw createError({ statusCode: 404, statusMessage: 'Managed QR code no longer exists; remove it from the artwork or choose another code' })
      qrRecords.set(metadata.qrCodeId, qr)
    }
    if (qr.client_id !== clientId) {
      throw createError({ statusCode: 403, statusMessage: 'Managed QR code must belong to the project client' })
    }
    if (!qr.is_active) {
      throw createError({ statusCode: 409, statusMessage: 'Managed QR code is inactive; activate it in QR Codes or remove it from the artwork before saving' })
    }
    // Destinations and styles may change after rendering. The immutable canonical code must match.
    if (qr.id !== metadata.qrCodeId || qr.code !== metadata.code) {
      throw createError({ statusCode: 400, statusMessage: 'Managed QR metadata does not match its canonical QR code; insert it again' })
    }
    let asset = assetRecords.get(metadata.assetId)
    if (!asset) {
      asset = await queryOneFresh<AssetRecord>(
        'SELECT id, client_id, mime_type, url, r2_key, tags FROM banner_assets WHERE id = $1', [metadata.assetId]
      ) ?? undefined
      if (!asset) throw createError({ statusCode: 400, statusMessage: 'Managed QR asset no longer exists; insert the QR code again' })
      assetRecords.set(metadata.assetId, asset)
    }
    if (asset.id !== metadata.assetId || asset.client_id !== clientId || asset.mime_type !== 'image/svg+xml'
      || asset.url !== src || typeof asset.r2_key !== 'string' || !asset.r2_key.startsWith('banner-assets/')
      || !hasAttestation(asset.tags, metadata, signingSecret)) {
      throw createError({ statusCode: 400, statusMessage: 'Managed QR asset provenance is invalid; insert the QR code again' })
    }
  }
}
