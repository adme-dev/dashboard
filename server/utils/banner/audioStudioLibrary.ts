import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { MAX_AUDIO_BYTES } from '~~/shared/bannerAudioRender.mjs'
import { buildMasterKey } from '~~/server/utils/audio/assets'
import { sniffAudioFormat } from '~~/server/utils/audio/importAudio'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getTransactionFailureStage, queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getPresignedDownloadUrl, isStorageConfigured, readStoredObject, type R2BucketBinding } from '~~/server/utils/storage'
import { bannerAssetDeliveryUrl, createBannerAssetId, createBannerAssetStorageKey, deleteBannerFile, uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from './assetDelivery'
import { hasAllBannerClientAccess, requireBannerClientAccess } from './clientAccess'

const assetColumns = 'id, name, mime_type AS "mimeType", file_size AS "fileSize", r2_key AS "r2Key", url, thumbnail_url AS "thumbnailUrl", tags, uploaded_by AS "uploadedBy", client_id AS "clientId", created_at AS "createdAt"'
const audioMime = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' }
const previewTtlSeconds = 5 * 60

export async function requireAudioLibraryProject(event: H3Event, projectId: unknown) {
  const user = await requireWriteAccess(event)
  const parsed = z.string().uuid().safeParse(projectId)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid banner project is required' })
  const project = await queryOneFresh<{ clientId: string | null, createdBy: string }>(
    'SELECT client_id AS "clientId", created_by AS "createdBy" FROM banner_projects WHERE id = $1 AND binned_at IS NULL', [parsed.data]
  )
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  if (project.clientId) await requireBannerClientAccess(event, project.clientId)
  else if (project.createdBy !== user.id && !await hasAllBannerClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
  return { clientId: project.clientId, userId: user.id }
}

async function readMaster(key: string, requestBucket?: R2BucketBinding) {
  const stored = requestBucket?.get ? await requestBucket.get(key) : await readStoredObject(key)
  if (!stored || !stored.size) throw createError({ statusCode: 404, statusMessage: 'Audio master is unavailable' })
  if (stored.size > MAX_AUDIO_BYTES) {
    await stored.body.cancel().catch(() => {})
    throw createError({ statusCode: 413, statusMessage: 'Banner Studio audio tracks must be 20 MB or smaller' })
  }
  const bytes = Buffer.alloc(stored.size)
  let offset = 0
  const reader = stored.body.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (offset + value.byteLength > bytes.length) throw createError({ statusCode: 502, statusMessage: 'Audio master size changed' })
      bytes.set(value, offset)
      offset += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  if (offset !== bytes.length) throw createError({ statusCode: 502, statusMessage: 'Audio master could not be read in full' })
  return bytes
}

async function requirePlayableTrack(assetId: string, clientId: string | null) {
  const source = await queryOneFresh<{ clientId: string | null, key: string, kind: 'music' | 'voiceover', title: string | null }>(`
    SELECT client_id AS "clientId", r2_key_master AS key, kind, title
    FROM audio_assets
    WHERE id = $1 AND (client_id IS NULL OR client_id = $2) AND r2_key_master IS NOT NULL AND status IN ('ready', 'done')
  `, [assetId, clientId])
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Audio track is unavailable for this project' })
  const extension = source.key.split('.').at(-1)
  if (!extension || !Object.hasOwn(audioMime, extension) || source.key !== buildMasterKey(source.clientId, assetId, extension)) {
    throw createError({ statusCode: 415, statusMessage: 'This audio master format is unsupported' })
  }
  return { ...source, extension }
}

export async function audioStudioPreviewUrl(assetId: string, clientId: string | null) {
  const { key } = await requirePlayableTrack(assetId, clientId)
  return isStorageConfigured()
    ? getPresignedDownloadUrl(key, previewTtlSeconds)
    : `/api/_uploads/${encodeURI(key)}`
}

export async function reuseAudioStudioTrack(event: H3Event, assetId: string, project: Awaited<ReturnType<typeof requireAudioLibraryProject>>) {
  const source = await requirePlayableTrack(assetId, project.clientId)
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  if (!signingSecret) throw createError({ statusCode: 503, statusMessage: 'Banner audio storage is unavailable' })
  const bucket = nativeUpload?.bucket
  const tag = `audio-studio:${assetId}`
  let createdKey: string | undefined
  let readyToCommit = false
  try {
    return await transactionWithoutRetry(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tag])
      const existing = await db.query(`SELECT ${assetColumns} FROM banner_assets
        WHERE client_id IS NOT DISTINCT FROM $1::uuid AND tags @> $2::text[] ORDER BY created_at, id LIMIT 1`,
      [source.clientId, ['audio-studio', tag]])
      if (existing.rows[0]) return existing.rows[0]

      const bytes = await readMaster(source.key, bucket)
      const format = sniffAudioFormat(bytes)
      if (!format || format !== source.extension) throw createError({ statusCode: 415, statusMessage: 'Audio master does not match its file format' })
      const id = createBannerAssetId()
      const filename = `audio-studio-${assetId}.${format}`
      createdKey = createBannerAssetStorageKey(filename, project.userId)
      const url = await bannerAssetDeliveryUrl(id, getAppUrl(event), signingSecret)
      const stored = await uploadBannerAsset(bytes, filename, audioMime[format], project.userId, createdKey, bucket ? { bucket, assetUrl: url } : undefined, url)
      const name = source.title?.trim().slice(0, 255) || (source.kind === 'music' ? 'Music' : 'Voiceover')
      const inserted = await db.query(`INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${assetColumns}`,
      [id, name, audioMime[format], stored.size, stored.key, stored.url, ['audio-studio', tag], project.userId, source.clientId])
      if (!inserted.rows[0]) throw new Error('Audio asset insert returned no row')
      readyToCommit = true
      return inserted.rows[0]
    })
  } catch (error) {
    if (createdKey && (!readyToCommit || getTransactionFailureStage(error) === 'definite_rollback')) {
      await deleteBannerFile(createdKey, bucket).catch(() => {})
    }
    throw error
  }
}
