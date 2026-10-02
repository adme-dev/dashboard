// server/api/agency/audio/projects/[id]/upload-media.post.ts
// Uploads footage (video) or a still (image) into an AV media project. Stores the
// file in R2 (or the local dev fallback) and returns a presigned/public URL +
// r2_key so the editor preview can load it. Mirrors the task-attachments upload
// pattern (readMultipartFormData → validate → uploadFile).
import { executeGodModeMediaUpload } from '~~/server/utils/audio/godModeExternalMutations'
import { requireWriteAccess } from '~~/server/utils/auth'
import { z } from 'zod'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { createVideoAsset } from '~~/server/utils/video/assets'
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
  const user = await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')!
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'upload-media requires an AV project' })
  }
  if (!canUseVideoGenerationProject(user, existing.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Project access denied' })
  }
  if (existing.project.clientId) await requireSocialClientAccess(event, existing.project.clientId)

  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })
  }

  const file = form.find(f => f.name === 'file')
  const kindField = form.find(f => f.name === 'kind')
  const kind = kindField?.data ? new TextDecoder().decode(kindField.data) : ''

  if (kind !== 'footage' && kind !== 'still') {
    throw createError({ statusCode: 400, statusMessage: 'kind must be \'footage\' or \'still\'' })
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

  // Intrinsic metadata is reported by the browser, not used to authorize access
  // or transcode the file. Keep old upload clients compatible when it is absent.
  let videoMetadata: { width: number, height: number, durationSec: number } | null = null
  const metadataText = kind === 'footage' ? form.find(f => f.name === 'videoMetadata')?.data : null
  if (metadataText?.length) {
    try {
      if (metadataText.length > 1024) throw new Error('Metadata too large')
      const text = new TextDecoder().decode(metadataText)
      if (text.trim()) videoMetadata = z.object({
        width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
        durationSec: z.number().positive().max(86400)
      }).parse(JSON.parse(text))
    } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid video metadata' }) }
  }
  let format = 'uploaded'
  if (videoMetadata) {
    let a = videoMetadata.width
    let b = videoMetadata.height
    while (b) {
      const remainder = a % b
      a = b
      b = remainder
    }
    format = `${videoMetadata.width / a}:${videoMetadata.height / a}`
  }
  type UploadResult = { r2_key: string, url: string, fileName: string, fileType: string, fileSize: number, kind: string, assetId: string | null }
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

    if (kind === 'footage') {
      const current = await getProjectWithCurrentTimeline(id)
      if (!current || current.project.mediaType !== 'av'
        || current.project.clientId !== existing.project.clientId
        || current.project.createdBy !== existing.project.createdBy) {
        throw createError({ statusCode: 409, statusMessage: 'Project changed during upload; reload before continuing' })
      }
    }

    const url = isStorageConfigured()
      ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
      : `/api/_uploads/${key}`

    const asset = kind === 'footage'
      ? await createVideoAsset({
          id: run.ids[0], clientId: existing.project.clientId ?? null, createdBy: user.id,
          title: file.filename, sourceProjectId: id, sourceJobId: null, r2Key: key, format,
          width: videoMetadata?.width ?? null, height: videoMetadata?.height ?? null,
          durationSec: videoMetadata?.durationSec ?? null
        })
      : null
    return { r2_key: key, url, fileName: file.filename, fileType, fileSize, kind, assetId: asset?.id ?? null }
  })

  setResponseStatus(event, 201)
  return result
})
