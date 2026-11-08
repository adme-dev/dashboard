// server/api/agency/audio/projects/[id]/import-audio.post.ts
// Provider-free import of a user-supplied audio file (WAV/MP3/M4A) into the canonical
// audio_assets pipeline, scoped to an AV project's client. The bytes are sniffed,
// hashed, stored at the canonical master key and measured by the storyboard media
// probe; only measured audio becomes a ready asset usable by storyboard audio cues.
import { executeGodModeMediaUpload } from '~~/server/utils/audio/godModeExternalMutations'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertMediaProjectAccess, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { mapRow, streamUrlFor } from '~~/server/utils/audio/assets'
import { INSERT_IMPORTED_AUDIO_ASSET_SQL, importAudioAsset } from '~~/server/utils/audio/importAudio'
import type { ImportAudioRole } from '~~/server/utils/audio/importAudio'
import { getFileMetadata, uploadFile } from '~~/server/utils/storage'
import { probeStoryboardMedia } from '~~/server/utils/video-storyboard/mediaProbe'
import { storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { queryOne } from '~~/server/utils/db'

const field = (form: Array<{ name?: string, data: Buffer }>, name: string) => {
  const part = form.find(f => f.name === name)
  return part?.data ? new TextDecoder().decode(part.data).trim() : ''
}

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(actor, existing.project)
  if (existing.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'import-audio requires an AV project' })

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })
  const file = form.find(f => f.name === 'file')
  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  const clientKey = getHeader(event, 'idempotency-key') ?? ''
  // Same bucket binding the storyboard metadata/probe path reads.
  const { bucket } = storyboardRequestDependencies(event)

  type ImportResult = { asset: ReturnType<typeof mapRow>, replayed: boolean }
  const result = await executeGodModeMediaUpload<ImportResult>(event, async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    const imported = await importAudioAsset({
      projectId: id,
      projectClientId: existing.project.clientId ?? null,
      actorId: actor.id,
      role: field(form, 'role') as ImportAudioRole,
      title: field(form, 'title') || null,
      filename: file.filename!,
      declaredType: file.type || '',
      bytes: new Uint8Array(file.data),
      rightsConfirmed: field(form, 'rightsConfirmed') === 'true',
      idempotencyKey: clientKey,
      assetId: run.ids[0]!
    }, {
      upload: (bytes, key, contentType) => uploadFile(Buffer.from(bytes), key, contentType, { projectId: id, kind: 'audio-import' }, bucket).then(() => undefined),
      metadata: key => getFileMetadata(key, bucket),
      probe: input => probeStoryboardMedia(input, { event }),
      findByIdempotencyKey: key => queryOne<Record<string, unknown>>('SELECT * FROM audio_assets WHERE idempotency_key = $1', [key]),
      insert: async params => (await queryOne<Record<string, unknown>>(INSERT_IMPORTED_AUDIO_ASSET_SQL, params))!
    })
    await run.markDispatched()
    const asset = mapRow(imported.row)
    asset.streamUrl = await streamUrlFor(asset)
    return { asset, replayed: imported.replayed }
  })

  setResponseStatus(event, result.replayed ? 200 : 201)
  return result
})
