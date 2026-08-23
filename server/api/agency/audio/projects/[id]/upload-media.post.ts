// server/api/agency/audio/projects/[id]/upload-media.post.ts
// Uploads footage (video) or a still (image) into an AV media project. Stores the
// file in R2 (or the local dev fallback) and returns a presigned/public URL +
// r2_key so the editor preview can load it. Mirrors the task-attachments upload
// pattern (readMultipartFormData → validate → uploadFile).
import { executeGodModeMediaUpload } from '~~/server/utils/audio/godModeExternalMutations'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import {
  uploadFile,
  getPresignedDownloadUrl,
  getPublicUrl,
  isStorageConfigured,
  generateStorageKey,
  validateFileType,
  validateFileSize,
  getMaxFileSize
} from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')!
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'upload-media requires an AV project' })
  }

  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })
  }

  const file = form.find(f => f.name === 'file')
  const kindField = form.find(f => f.name === 'kind')
  const kind = kindField?.data ? new TextDecoder().decode(kindField.data) : ''

  if (kind !== 'footage' && kind !== 'still') {
    throw createError({ statusCode: 400, statusMessage: "kind must be 'footage' or 'still'" })
  }
  if (!file?.data || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  const category = kind === 'footage' ? 'media-video' : 'media-image'
  const fileType = file.type || 'application/octet-stream'
  const fileSize = file.data.length

  if (!validateFileType(fileType, category)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported ${kind} type: ${fileType}` })
  }
  if (!validateFileSize(fileSize, category)) {
    const maxMB = Math.round(getMaxFileSize(category) / (1024 * 1024))
    throw createError({ statusCode: 400, statusMessage: `${kind} exceeds the ${maxMB}MB size limit` })
  }

  type UploadResult = { r2_key: string; url: string; fileName: string; fileType: string; fileSize: number; kind: string }
  const result = await executeGodModeMediaUpload<UploadResult>(event, async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    // Produce a key shaped like media/<projectId>/<kind>/<timestamp>-<name>-<uuid>.<ext>.
    // generateStorageKey(category, filename) yields "<category>/<timestamp>-<name>-<uuid>.<ext>";
    // re-root its category segment under media/<id>/<kind> so all AV media lands in one prefix
    // regardless of footage/still category split.
    // The reserved id replaces the random uuid so a God-mode replay can re-derive the key.
    const generated = generateStorageKey(category, file.filename)
    const key = `media/${id}/${kind}/${generated.slice(generated.indexOf('/') + 1).replace(/[0-9a-f-]{36}(?=\.[^.]+$)/i, run.ids[0]!)}`

    await uploadFile(file.data, key, fileType, { projectId: id, kind })
    await run.markDispatched()

    const url = isStorageConfigured()
      ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
      : `/api/_uploads/${key}`

    return { r2_key: key, url, fileName: file.filename, fileType, fileSize, kind }
  })

  setResponseStatus(event, 201)
  return result
})
