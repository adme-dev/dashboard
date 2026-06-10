import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured, uploadFile } from '~~/server/utils/storage'

const ProjectIdSchema = z.string().uuid()
const MAX_MASK_BYTES = 10 * 1024 * 1024

function decodeField(data: Buffer | Uint8Array | undefined): string {
  if (!data) return ''
  return new TextDecoder().decode(data).trim()
}

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const sourceAssetId = getRouterParam(event, 'id')
  if (!sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })

  const projectId = ProjectIdSchema.parse(decodeField(form.find(part => part.name === 'projectId')?.data))
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Mask upload requires an AV project' })

  const file = form.find(part => part.name === 'file')
  if (!file?.data) throw createError({ statusCode: 400, statusMessage: 'Missing mask file' })
  if ((file.type || 'application/octet-stream') !== 'image/png') {
    throw createError({ statusCode: 400, statusMessage: 'Brush masks must be PNG images' })
  }
  if (file.data.length > MAX_MASK_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Brush mask exceeds the 10MB size limit' })
  }

  const key = `video-asset-masks/${projectId}/${sourceAssetId}/${Date.now()}-${randomUUID()}.png`
  const uploaded = await uploadFile(file.data, key, 'image/png', {
    projectId,
    sourceAssetId,
    kind: 'brush-mask',
  })
  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : uploaded.url

  setResponseStatus(event, 201)
  return { maskKey: key, url, size: uploaded.size }
})
