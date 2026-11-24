// server/api/agency/audio/projects/[id]/upload-media.post.ts
// Uploads footage (video) or a still (image) into an AV media project. Stores the
// file in R2 (or the local dev fallback) and returns a presigned/public URL +
// r2_key so the editor preview can load it. Mirrors the task-attachments upload
// pattern (readMultipartFormData → validate → uploadFile).
//
// The upload also becomes a library asset (video_assets) filed under Footage or
// Stills, so it can be chosen in Prepare. A video has no still of its own, so the
// browser sends a `poster` frame with it and that is saved as the preview frame.
import { executeGodModeMediaUpload } from '~~/server/utils/audio/godModeExternalMutations'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertMediaProjectAccess, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
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
import { createVideoAsset, isPreparablePictureKey } from '~~/server/utils/video/assets'
import { addAssetToProjectBucket } from '~~/server/utils/video-asset-intelligence/db'

const MAX_POSTER_BYTES = 10 * 1024 * 1024

function fieldText(form: Array<{ name?: string; data: Buffer }>, name: string): string {
  const part = form.find(f => f.name === name)
  return part?.data ? new TextDecoder().decode(part.data).trim() : ''
}

// A whole number of pixels, or null: the browser reports the size, the file is not parsed here.
function pixels(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null
}

function seconds(value: string): number | null {
  const n = Number(value)
  return value && Number.isFinite(n) && n > 0 && n <= 6 * 60 * 60 ? Math.round(n * 1000) / 1000 : null
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (base || filename).slice(0, 200)
}

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')!
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  assertMediaProjectAccess(actor, existing.project)
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

  // Optional preview frame, captured in the browser (a Worker cannot decode video).
  const poster = form.find(f => f.name === 'poster')
  if (poster?.data?.length) {
    if (poster.type !== 'image/jpeg') throw createError({ statusCode: 400, statusMessage: 'The preview frame must be a JPEG image' })
    if (poster.data.length > MAX_POSTER_BYTES) throw createError({ statusCode: 400, statusMessage: 'The preview frame exceeds the 10MB size limit' })
  }
  const width = pixels(fieldText(form, 'width'))
  const height = pixels(fieldText(form, 'height'))
  const durationSec = kind === 'footage' ? seconds(fieldText(form, 'durationSec')) : null

  type UploadResult = {
    r2_key: string; url: string; fileName: string; fileType: string; fileSize: number; kind: string
    assetId: string | null; thumbnailSaved: boolean
  }
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

    // The preview frame: the poster when one was sent, otherwise a PNG or JPEG still is its own.
    let thumbnailKey: string | null = null
    if (poster?.data?.length) {
      thumbnailKey = `${key}.poster.jpg`
      await uploadFile(poster.data, thumbnailKey, 'image/jpeg', { projectId: id, kind: 'asset-thumbnail' })
    } else if (kind === 'still' && isPreparablePictureKey(key)) {
      thumbnailKey = key
    }
    const title = titleFromFilename(file.filename!)
    const asset = await createVideoAsset({
      id: run.ids[0]!,
      clientId: existing.project.clientId ?? null,
      createdBy: actor.id,
      title,
      sourceProjectId: id,
      sourceJobId: null,
      r2Key: key,
      format: kind,
      width,
      height,
      durationSec,
      thumbnailKey,
      metadata: { source: 'upload', mediaKind: kind, contentType: fileType, size: fileSize, fileName: file.filename },
    })
    await addAssetToProjectBucket({
      projectId: id,
      bucketKind: kind === 'still' ? 'stills' : 'footage',
      assetId: asset.id,
      r2Key: key,
      title,
      role: kind === 'still' ? 'uploaded-still' : 'uploaded-footage',
      directive: { source: 'video_assets', format: kind, durationSec },
    })

    const url = isStorageConfigured()
      ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
      : `/api/_uploads/${key}`

    return { r2_key: key, url, fileName: file.filename!, fileType, fileSize, kind, assetId: asset.id, thumbnailSaved: Boolean(thumbnailKey) }
  })

  setResponseStatus(event, 201)
  return result
})
