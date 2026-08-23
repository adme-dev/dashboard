import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { uploadFile, validateFileType, validateFileSize, getMaxFileSize } from '~~/server/utils/storage'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { randomUUID } from 'node:crypto'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

const SUBJECT_TYPES = new Set(['vehicle', 'non_vehicle', 'unknown'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'sourceAssetUpload', async () => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((f) => f.name === 'file')
  const projectField = form?.find((f) => f.name === 'projectId')
  const subjectField = form?.find((f) => f.name === 'subjectType')
  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  const projectId = projectField?.data ? new TextDecoder().decode(projectField.data) : ''
  if (!UUID_RE.test(projectId)) throw createError({ statusCode: 400, statusMessage: 'Valid projectId required' })
  const project = await getProjectWithCurrentTimeline(projectId)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Source upload requires an AV project' })
  if (!canUseVideoGenerationProject(user, project.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const fileType = file.type || 'application/octet-stream'
  if (!validateFileType(fileType, 'media-image')) throw createError({ statusCode: 400, statusMessage: `Unsupported image type: ${fileType}` })
  if (!validateFileSize(file.data.length, 'media-image')) {
    const maxMB = Math.round(getMaxFileSize('media-image') / (1024 * 1024))
    throw createError({ statusCode: 400, statusMessage: `Image exceeds the ${maxMB}MB limit` })
  }
  const subjectType = subjectField?.data ? new TextDecoder().decode(subjectField.data) : 'unknown'
  if (!SUBJECT_TYPES.has(subjectType)) throw createError({ statusCode: 400, statusMessage: 'Invalid subjectType' })
  const ext = (file.filename.split('.').pop() || 'jpg').toLowerCase()
  const clientId = project.project.clientId ?? null
  const r2Key = `video-gen-sources/${clientId ?? 'agency'}/${randomUUID()}.${ext}`
  await uploadFile(file.data, r2Key, fileType, { kind: 'i2v-source' })
  const asset = await createSourceAsset({
    clientId,
    createdBy: user.id,
    r2Key,
    contentType: fileType,
    subjectType,
    originalFilename: file.filename,
  })
  setResponseStatus(event, 201)
  return { id: asset.id, status: asset.status }
}))
