import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured, uploadFile } from '~~/server/utils/storage'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'
import { paintedFrameKeyForMask } from '~~/shared/video/assetIntelligenceMaskFrame'

const ProjectIdSchema = z.string().uuid()
const MAX_MASK_BYTES = 10 * 1024 * 1024
const MAX_FRAME_BYTES = 10 * 1024 * 1024

function decodeField(data: Buffer | Uint8Array | undefined): string {
  if (!data) return ''
  return new TextDecoder().decode(data).trim()
}

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'assetMasks', async () => {
  const user = await requireWriteAccess(event)
  const sourceAssetId = getRouterParam(event, 'id')
  if (!sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })

  const projectId = ProjectIdSchema.parse(decodeField(form.find(part => part.name === 'projectId')?.data))
  await requireVideoProjectWriteAccess(user, projectId, 'Mask upload requires an AV project')

  const sourceAsset = await getAssetProjectRelationship(sourceAssetId)
  if (!sourceAsset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!sourceAsset.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  if (sourceAsset.projectId !== projectId) {
    throw createError({ statusCode: 403, statusMessage: 'Source asset does not belong to this project' })
  }

  const file = form.find(part => part.name === 'file')
  if (!file?.data) throw createError({ statusCode: 400, statusMessage: 'Missing mask file' })
  if ((file.type || 'application/octet-stream') !== 'image/png') {
    throw createError({ statusCode: 400, statusMessage: 'Brush masks must be PNG images' })
  }
  if (file.data.length > MAX_MASK_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Brush mask exceeds the 10MB size limit' })
  }

  // Optional: the video frame the mask was painted on. A video has no still of its
  // own, so erase works on this frame. It is stored beside the mask.
  const frame = form.find(part => part.name === 'frame')
  if (frame?.data?.length) {
    if (frame.type !== 'image/jpeg') throw createError({ statusCode: 400, statusMessage: 'The painted frame must be a JPEG image' })
    if (frame.data.length > MAX_FRAME_BYTES) throw createError({ statusCode: 400, statusMessage: 'The painted frame exceeds the 10MB size limit' })
  }

  const key = `video-asset-masks/${projectId}/${sourceAssetId}/${Date.now()}-${randomUUID()}.png`
  const frameKey = frame?.data?.length ? paintedFrameKeyForMask(key) : null
  if (frame?.data?.length && frameKey) {
    await uploadFile(frame.data, frameKey, 'image/jpeg', { projectId, sourceAssetId, kind: 'brush-mask-frame' })
  }
  const uploaded = await uploadFile(file.data, key, 'image/png', {
    projectId,
    sourceAssetId,
    kind: 'brush-mask',
  })
  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : uploaded.url

  setResponseStatus(event, 201)
  return { maskKey: key, url, size: uploaded.size, frameSaved: Boolean(frameKey) }
}))
