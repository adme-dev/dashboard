// Banner Studio's side of "Import image as layers". The work is the asset-intelligence
// Worker's Separate layers job; this queues it for a banner upload and turns what it
// stored into media-library pictures the editor can place.
import { createError, type H3Event } from 'h3'
import type { User } from '~~/server/utils/auth'
import { hasAllBannerClientAccess, requireBannerClientAccess } from '~~/server/utils/banner/clientAccess'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { bannerAssetDeliveryUrl, createBannerAssetId, isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'
import { getAppUrl } from '~~/server/utils/appUrl'
import { queryOne, transaction } from '~~/server/utils/db'
import { getPublicUrl } from '~~/server/utils/storage'
import { defaultModelForAction } from '~~/server/utils/video-asset-intelligence/registry'
import {
  LAYER_IMPORT_MIME_TYPES,
  type BannerLayerImportBox,
  type BannerLayerImportLayer,
  type BannerLayerImportResult,
  type BannerLayerImportSkip,
  type BannerLayerImportStatus,
  type BannerLayerImportText
} from '~~/shared/bannerLayerImport'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export interface LayerImportSourceAsset {
  id: string
  name: string
  mimeType: string
  uploadedBy: string
  clientId: string | null
}

/** The uploaded picture to split, found by id or by the address a layer points at. */
export async function findLayerImportSource(input: { assetId?: string | null, src?: string | null }): Promise<LayerImportSourceAsset | null> {
  const columns = 'id, name, mime_type AS "mimeType", uploaded_by AS "uploadedBy", client_id AS "clientId"'
  if (input.assetId) return await queryOne<LayerImportSourceAsset>(`SELECT ${columns} FROM banner_assets WHERE id = $1`, [input.assetId])
  if (input.src) return await queryOne<LayerImportSourceAsset>(`SELECT ${columns} FROM banner_assets WHERE url = $1 ORDER BY created_at DESC LIMIT 1`, [input.src])
  return null
}

/** Same rule as the media library list: your own unassigned uploads, or a client you can work on. */
export async function requireLayerImportSourceAccess(event: H3Event, user: User, asset: LayerImportSourceAsset): Promise<void> {
  if (asset.clientId) {
    await requireBannerClientAccess(event, asset.clientId)
    return
  }
  if (asset.uploadedBy === user.id || await hasAllBannerClientAccess(user)) return
  throw createError({ statusCode: 403, statusMessage: 'You do not have access to this picture' })
}

export function assertLayerImportPicture(asset: LayerImportSourceAsset): void {
  if (!LAYER_IMPORT_MIME_TYPES.includes(asset.mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG and PNG pictures can be split into layers.' })
  }
}

export async function createLayerImportJob(input: { projectId: string, bannerAssetId: string, createdBy: string }): Promise<{ id: string, status: string }> {
  const model = defaultModelForAction('layer-decomposition')
  if (!model) throw createError({ statusCode: 409, statusMessage: 'Separate layers is not available yet.' })
  const row = await queryOne<{ id: string, status: string }>(
    `INSERT INTO video_asset_intelligence_jobs
      (project_id, source_asset_id, source_banner_asset_id, action, model_id, provider, status, output_derivative_ids, created_by)
     VALUES ($1, NULL, $2, 'layer-decomposition', $3, $4, 'queued', '[]'::jsonb, $5)
     RETURNING id, status`,
    [input.projectId, input.bannerAssetId, model.id, model.provider, input.createdBy]
  )
  if (!row) throw new Error('Layer import job was not created')
  return row
}

interface DerivativeRow {
  id: string
  kind: string
  r2_key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown> | null
}

interface JobRow {
  id: string
  status: string
  error_message: string | null
  created_by: string
  created_at: string | Date | null
  started_at: string | Date | null
  source_banner_asset_id: string | null
  output_derivative_ids: unknown
  client_id: string | null
}

function iso(value: string | Date | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function box(value: unknown): BannerLayerImportBox | null {
  const candidate = value as Partial<BannerLayerImportBox> | null
  if (!candidate || typeof candidate !== 'object') return null
  const { x, y, width, height } = candidate
  if (![x, y, width, height].every(n => typeof n === 'number' && Number.isFinite(n))) return null
  if (width! <= 0 || height! <= 0) return null
  return { x: x!, y: y!, width: width!, height: height! }
}

function skips(value: unknown): BannerLayerImportSkip[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { name, step, reason } = entry as Record<string, unknown>
    return [{ name: String(name ?? 'Element'), step: String(step ?? 'extract'), reason: String(reason ?? 'It did not come back.') }]
  })
}

function pngName(title: string): string {
  const cleaned = title.replace(/[\\/\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${cleaned || 'Layer'}.png`
}

/**
 * The state of an import. The first read after the job succeeds adds each layer
 * picture to the media library; later reads return the same pictures.
 */
export async function readLayerImport(event: H3Event, user: User, jobId: string): Promise<BannerLayerImportStatus> {
  const { signingSecret } = resolveBannerAssetDelivery(event)
  const appUrl = getAppUrl(event)
  return await transaction(async (db) => {
    const job = (await db.query<JobRow>(
      `SELECT j.id, j.status, j.error_message, j.created_by, j.created_at, j.started_at,
              j.source_banner_asset_id, j.output_derivative_ids, ba.client_id
         FROM video_asset_intelligence_jobs j
         LEFT JOIN banner_assets ba ON ba.id = j.source_banner_asset_id
        WHERE j.id = $1 AND j.action = 'layer-decomposition' AND j.source_banner_asset_id IS NOT NULL
        FOR UPDATE OF j`,
      [jobId]
    )).rows[0]
    if (!job) throw createError({ statusCode: 404, statusMessage: 'Import not found' })
    if (job.created_by !== user.id) {
      throw createError({ statusCode: 403, statusMessage: 'This import belongs to someone else' })
    }
    const status: BannerLayerImportStatus = {
      jobId: job.id,
      // A blocked job never ran, which is a failure as far as the editor is concerned.
      status: job.status === 'blocked' ? 'failed' : job.status as BannerLayerImportStatus['status'],
      error: job.status === 'failed' || job.status === 'blocked' ? job.error_message || 'The import failed.' : null,
      createdAt: iso(job.created_at),
      startedAt: iso(job.started_at),
      result: null
    }
    if (job.status !== 'succeeded') return status

    const ids = Array.isArray(job.output_derivative_ids) ? job.output_derivative_ids.filter(isUuid) : []
    const derivatives = ids.length
      ? (await db.query<DerivativeRow>(
          `SELECT id, kind, r2_key, width, height, metadata FROM video_asset_derivatives WHERE id = ANY($1::uuid[])`,
          [ids]
        )).rows
      : []

    // Adds one layer picture to the media library, once.
    const publish = async (derivative: DerivativeRow, title: string): Promise<{ assetId: string, url: string } | null> => {
      const metadata = derivative.metadata ?? {}
      if (isUuid(metadata.bannerAssetId) && typeof metadata.bannerAssetUrl === 'string') {
        return { assetId: metadata.bannerAssetId, url: metadata.bannerAssetUrl }
      }
      // The Worker writes banner layers into the uploader's own key space; anything else is not servable.
      if (!isBannerAssetDeliveryKey(derivative.r2_key, job.created_by)) return null
      const assetId = createBannerAssetId()
      const url = signingSecret ? await bannerAssetDeliveryUrl(assetId, appUrl, signingSecret) : getPublicUrl(derivative.r2_key)
      if (!url) throw createError({ statusCode: 503, statusMessage: 'Banner asset storage is unavailable' })
      await db.query(
        `INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
         VALUES ($1, $2, 'image/png', $3, $4, $5, $6, $7, $8)`,
        [assetId, pngName(title), Number(metadata.size) || 0, derivative.r2_key, url, ['layer-import'], job.created_by, job.client_id]
      )
      await db.query(
        `UPDATE video_asset_derivatives SET metadata = metadata || $2::jsonb WHERE id = $1`,
        [derivative.id, JSON.stringify({ bannerAssetId: assetId, bannerAssetUrl: url })]
      )
      return { assetId, url }
    }

    const layers: BannerLayerImportLayer[] = []
    let base: BannerLayerImportResult['base'] = null
    let pack: DerivativeRow | null = null
    for (const derivative of derivatives) {
      const metadata = derivative.metadata ?? {}
      if (derivative.kind === 'layer-package') {
        pack = derivative
      } else if (derivative.kind === 'background-png') {
        const published = await publish(derivative, 'Background')
        if (published) base = { ...published, width: derivative.width ?? 0, height: derivative.height ?? 0 }
      } else if (derivative.kind === 'foreground-png') {
        const bbox = box(metadata.bbox)
        const name = typeof metadata.layerName === 'string' && metadata.layerName.trim() ? metadata.layerName.trim() : 'Layer'
        if (!bbox) continue
        const published = await publish(derivative, name)
        if (!published) continue
        layers.push({
          ...published,
          name,
          kind: typeof metadata.layerKind === 'string' ? metadata.layerKind : 'graphic',
          z: Number(metadata.z) || layers.length + 1,
          bbox,
          width: derivative.width ?? Math.round(bbox.width),
          height: derivative.height ?? Math.round(bbox.height),
          text: metadata.text && typeof metadata.text === 'object' && typeof (metadata.text as BannerLayerImportText).text === 'string'
            ? metadata.text as BannerLayerImportText
            : null
        })
      }
    }
    layers.sort((a, b) => a.z - b.z)
    const packMetadata = pack?.metadata ?? {}
    status.result = {
      width: pack?.width ?? (Number(derivatives[0]?.metadata?.sourceWidth) || 0),
      height: pack?.height ?? (Number(derivatives[0]?.metadata?.sourceHeight) || 0),
      base,
      layers,
      skipped: skips(packMetadata.skipped),
      costUsd: typeof packMetadata.costUsd === 'number' ? packMetadata.costUsd : null,
      latencyMs: typeof packMetadata.latencyMs === 'number' ? packMetadata.latencyMs : null
    }
    return status
  })
}
