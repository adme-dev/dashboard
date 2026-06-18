import { randomUUID } from 'crypto'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { downloadFileBuffer, getPresignedDownloadUrl, getPublicUrl, isStorageConfigured, uploadFile } from '~~/server/utils/storage'
import { speechToText } from '~~/server/utils/aiVoice'
import { transcriptToSingleCueVtt } from '~~/server/utils/video/captions'
import { getAccessibleVideoAsset, mapVideoAssetRow } from '~~/server/utils/video/assets'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'

const MAX_TRANSCRIBE_BYTES = 100 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })

  const assetProject = await getAssetProjectRelationship(id)
  if (!assetProject) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!assetProject.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  await requireVideoProjectWriteAccess(user, assetProject.projectId, 'Caption generation requires an AV project')

  const asset = await getAccessibleVideoAsset(id, user)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const media = await downloadFileBuffer(asset.r2Key)
  if (media.byteLength > MAX_TRANSCRIBE_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Asset is too large for inline caption generation. Render a shorter cut first.' })
  }

  const stt = await speechToText(event, media)
  if (!stt?.text) {
    throw createError({ statusCode: 422, statusMessage: 'Could not generate captions from this asset audio.' })
  }

  const vtt = transcriptToSingleCueVtt(stt.text, asset.durationSec)
  const key = `video-captions/${assetProject.projectId}/${id}/${Date.now()}-${randomUUID()}.vtt`
  const uploaded = await uploadFile(Buffer.from(vtt, 'utf8'), key, 'text/vtt; charset=utf-8', {
    projectId: assetProject.projectId,
    sourceAssetId: id,
    kind: 'caption-vtt',
  })

  const row = await queryOne(
    `UPDATE video_assets
        SET caption_vtt_key = $2,
            transcript = $3,
            metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      key,
      stt.text,
      JSON.stringify({
        captions: {
          provider: 'workers-ai',
          model: '@cf/openai/whisper-large-v3-turbo',
          generated_at: new Date().toISOString(),
          duration_ms: stt.durationMs,
        },
      }),
    ]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const updatedAsset = mapVideoAssetRow(row)
  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : uploaded.url

  setResponseStatus(event, 201)
  return {
    asset: updatedAsset,
    captionVttKey: key,
    captionVttUrl: updatedAsset.captionVttUrl,
    downloadUrl: url,
    transcript: stt.text,
  }
})
