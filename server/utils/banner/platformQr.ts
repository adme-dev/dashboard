import { randomUUID, createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh, execute } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import {
  requireQrCodeAccess,
  shortUrl,
  type QrCodeRow
} from '~~/server/utils/qr/access'
import { requireQrClientAccess } from '~~/server/utils/qr/permissions'
import {
  bannerAssetDeliveryUrl,
  createBannerAssetStorageKey,
  uploadBannerAsset,
  deleteBannerFile
} from '~~/server/utils/bannerStorage'
import { getAppUrl } from '~~/server/utils/appUrl'
import { resolveBannerAssetDelivery } from './assetDelivery'
import { signPlatformQrAssetAttestation } from './platformQrCanvas'
import {
  assertArtworkRevision,
  inspectArtworkReference,
  validateArtworkPng
} from './artworkValidation'
import { renderQrSvg } from '../../../shared/qr/render-svg'
import { QrStyleSchema } from '../../../shared/qr/style'
import {
  QrFrameSchema,
  wrapQrSvgWithFrame,
  svgViewBox
} from '../../../shared/qr/frame'
import {
  bannerQrRequestSchema,
  bannerQrResponseSchema,
  type BannerQrResponse
} from '../../../shared/bannerQr'

interface Project {
  id: string
  client_id: string | null
  updated_at: string | Date
}
type StoredQr = QrCodeRow & { frame?: unknown }
function iso(value: string | Date) {
  return new Date(value).toISOString()
}
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    )
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}
function checkedStyle(qr: StoredQr) {
  const parsed = QrStyleSchema.safeParse(qr.style || {}),
    frame = QrFrameSchema.safeParse(qr.frame || {})
  if (!parsed.success || !frame.success)
    throw createError({
      statusCode: 400,
      statusMessage:
        'QR style is invalid; review this code in QR Codes before inserting it'
    })
  const style = parsed.data,
    background = luminance(style.bg)
  for (const color of [style.fg, style.eyeFg || style.fg]) {
    const foreground = luminance(color)
    if (
      foreground >= background
      || (background + 0.05) / (foreground + 0.05) < 4.5
    )
      throw createError({
        statusCode: 400,
        statusMessage:
          'QR contrast is too low for artwork; use darker modules and a lighter background in QR Codes'
      })
  }
  if (style.logo) {
    if (!style.logo.dataUri.startsWith('data:image/png;base64,'))
      throw createError({
        statusCode: 400,
        statusMessage:
          'SVG centre logos are not supported for artwork insertion; select a PNG logo in QR Codes'
      })
    const logo = Buffer.from(
      style.logo.dataUri.slice('data:image/png;base64,'.length),
      'base64'
    )
    if (logo.length > 256 * 1024)
      throw createError({
        statusCode: 400,
        statusMessage: 'QR centre logo exceeds 256 KiB; update it in QR Codes'
      })
    try {
      inspectArtworkReference(logo, 'image/png', 1048576)
      validateArtworkPng(logo, false)
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage:
          'QR centre PNG logo is invalid or exceeds one megapixel; update it in QR Codes'
      })
    }
  }
  return {
    style: { ...style, margin: Math.max(4, style.margin) },
    frame: frame.data,
    sourceQuietZone: style.margin
  }
}
async function projectScope(
  event: H3Event,
  id: string,
  revision: string,
  expectedClient?: string
) {
  const project = await queryOneFresh<Project>(
    'SELECT id,client_id,updated_at FROM banner_projects WHERE id=$1',
    [id]
  )
  if (!project)
    throw createError({
      statusCode: 404,
      statusMessage: 'Banner project not found'
    })
  if (!project.client_id)
    throw createError({
      statusCode: 400,
      statusMessage:
        'Assign this banner project to a client before inserting a platform QR code'
    })
  await requireSocialClientAccess(event, project.client_id)
  if (expectedClient && project.client_id !== expectedClient)
    throw createError({
      statusCode: 409,
      statusMessage: 'Project client changed; request a new QR asset'
    })
  assertArtworkRevision(project.updated_at, revision)
  return project
}
async function currentQr(
  event: H3Event,
  id: string,
  clientId: string,
  expectedUpdatedAt?: string
) {
  const qr = await queryOneFresh<StoredQr>(
    'SELECT * FROM qr_codes WHERE id=$1',
    [id]
  )
  if (!qr)
    throw createError({
      statusCode: 404,
      statusMessage: 'QR code no longer exists'
    })
  if (qr.client_id !== clientId)
    throw createError({
      statusCode: 403,
      statusMessage: 'Choose a QR code belonging to this banner project client'
    })
  await requireQrClientAccess(event, qr.client_id)
  if (!qr.is_active)
    throw createError({
      statusCode: 409,
      statusMessage:
        'This QR code is inactive; activate it in QR Codes before inserting it'
    })
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(qr.code))
    throw createError({
      statusCode: 400,
      statusMessage: 'QR code identifier is invalid; review it in QR Codes'
    })
  if (expectedUpdatedAt && iso(qr.updated_at) !== expectedUpdatedAt)
    throw createError({
      statusCode: 409,
      statusMessage: 'QR code changed; request a new QR asset'
    })
  return qr
}
export async function insertBannerPlatformQr(
  event: H3Event,
  projectId: unknown,
  raw: unknown
): Promise<BannerQrResponse> {
  const user = await requireWriteAccess(event)
  const id = z.string().uuid().safeParse(projectId),
    request = bannerQrRequestSchema.safeParse(raw)
  if (!id.success || !request.success)
    throw createError({
      statusCode: 400,
      statusMessage:
        'A saved project, QR code and source revision are required'
    })
  const input = request.data,
    project = await projectScope(event, id.data, input.sourceRevision)
  const authorizedClientId = project.client_id!
  // QR visibility alone cannot grant project access, and project access cannot grant QR permissions.
  await requireQrCodeAccess(event, input.qrCodeId)
  const qr = await currentQr(event, input.qrCodeId, authorizedClientId),
    qrUpdatedAt = iso(qr.updated_at)
  const { style, frame, sourceQuietZone } = checkedStyle(qr)
  const svg = wrapQrSvgWithFrame({
    inner: renderQrSvg({ text: shortUrl(qr.code), style }),
    frame,
    fg: style.fg
  })
  const dimensions = svgViewBox(svg),
    bytes = Buffer.from(svg),
    sha256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length > 1024 * 1024 || dimensions.w > 4096 || dimensions.h > 4096)
    throw createError({
      statusCode: 400,
      statusMessage: 'QR artwork exceeds supported SVG bounds'
    })
  const delivery = resolveBannerAssetDelivery(event)
  if (!delivery.signingSecret)
    throw createError({
      statusCode: 503,
      statusMessage: 'Private banner asset delivery is unavailable'
    })
  const assetId = randomUUID(),
    name = `platform-qr-${assetId}.svg`,
    key = createBannerAssetStorageKey(name, user.id)
  const url = await bannerAssetDeliveryUrl(
    assetId,
    getAppUrl(event),
    delivery.signingSecret
  )
  let inserted = false
  try {
    await uploadBannerAsset(
      bytes,
      name,
      'image/svg+xml',
      user.id,
      key,
      delivery.nativeUpload
        ? { bucket: delivery.nativeUpload.bucket, assetUrl: url }
        : undefined,
      url
    )
    await projectScope(
      event,
      id.data,
      input.sourceRevision,
      authorizedClientId
    )
    await currentQr(event, input.qrCodeId, authorizedClientId, qrUpdatedAt)
    await execute(
      'INSERT INTO banner_assets (id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id,tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        assetId,
        name,
        'image/svg+xml',
        bytes.length,
        key,
        url,
        user.id,
        authorizedClientId,
        ['platform-qr', `qr:${qr.id}`, signPlatformQrAssetAttestation({
          assetId,
          clientId: authorizedClientId,
          qrCodeId: qr.id,
          code: qr.code,
          sha256
        }, delivery.signingSecret)]
      ]
    )
    inserted = true
    await projectScope(
      event,
      id.data,
      input.sourceRevision,
      authorizedClientId
    )
    await currentQr(event, input.qrCodeId, authorizedClientId, qrUpdatedAt)
    return bannerQrResponseSchema.parse({
      projectId: id.data,
      sourceRevision: input.sourceRevision,
      asset: {
        id: assetId,
        url,
        mimeType: 'image/svg+xml',
        width: dimensions.w,
        height: dimensions.h,
        sha256
      },
      platformQr: {
        version: 1,
        qrCodeId: qr.id,
        clientId: qr.client_id,
        code: qr.code,
        shortUrl: shortUrl(qr.code),
        name: qr.name,
        renderedAt: new Date().toISOString(),
        qrUpdatedAt,
        assetId,
        sha256,
        quietZone: style.margin,
        sourceQuietZone,
        warnings:
          sourceQuietZone < 4
            ? [
                'Artwork rendering adds a four-module quiet zone; the saved QR code settings are unchanged.'
              ]
            : []
      }
    })
  } catch (error) {
    if (inserted)
      await execute(
        'DELETE FROM banner_assets WHERE id=$1 AND uploaded_by=$2 AND client_id=$3',
        [assetId, user.id, authorizedClientId]
      ).catch(() => {})
    await deleteBannerFile(key, delivery.nativeUpload?.bucket).catch(() => {})
    throw error
  }
}
