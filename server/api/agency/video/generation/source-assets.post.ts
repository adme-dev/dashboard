import { requireWriteAccess } from '~~/server/utils/auth'
import { uploadFile, validateFileType, validateFileSize, getMaxFileSize } from '~~/server/utils/storage'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((f) => f.name === 'file')
  const clientField = form?.find((f) => f.name === 'clientId')
  const subjectField = form?.find((f) => f.name === 'subjectType')
  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  const fileType = file.type || 'application/octet-stream'
  if (!validateFileType(fileType, 'media-image')) throw createError({ statusCode: 400, statusMessage: `Unsupported image type: ${fileType}` })
  if (!validateFileSize(file.data.length, 'media-image')) {
    const maxMB = Math.round(getMaxFileSize('media-image') / (1024 * 1024))
    throw createError({ statusCode: 400, statusMessage: `Image exceeds the ${maxMB}MB limit` })
  }
  const clientId = clientField?.data ? new TextDecoder().decode(clientField.data) || null : null
  const subjectType = subjectField?.data ? new TextDecoder().decode(subjectField.data) : 'unknown'
  const ext = (file.filename.split('.').pop() || 'jpg').toLowerCase()
  const r2Key = `video-gen-sources/${clientId ?? 'agency'}/${randomUUID()}.${ext}`
  await uploadFile(file.data, r2Key, fileType, { kind: 'i2v-source' })
  const asset = await createSourceAsset({ clientId, createdBy: user.id, r2Key, contentType: fileType, subjectType })
  setResponseStatus(event, 201)
  return { id: asset.id, status: asset.status }
})
