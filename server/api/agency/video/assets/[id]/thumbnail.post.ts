// Saves a preview frame for a library asset that has none.
//
// Most videos in the library were saved before preview frames existed, and the
// picture tools (separate layers, lift, remove background, erase) need a still to
// work on. The Prepare workspace captures the frame it is showing and sends it here.
import { randomUUID } from 'crypto'
import { requireWriteAccess } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { setVideoAssetThumbnailIfMissing } from '~~/server/utils/video/assets'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

const MAX_FRAME_BYTES = 10 * 1024 * 1024
const FRAME_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'assetThumbnail', async () => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })
  const assetProject = await getAssetProjectRelationship(id)
  if (!assetProject) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (!assetProject.projectId) throw createError({ statusCode: 400, statusMessage: 'Asset is not attached to a project' })
  await requireVideoProjectWriteAccess(user, assetProject.projectId, 'Saving a preview frame requires an AV project')

  const form = await readMultipartFormData(event)
  const file = form?.find(part => part.name === 'file')
  if (!file?.data?.length) throw createError({ statusCode: 400, statusMessage: 'Missing preview frame' })
  const extension = FRAME_EXTENSIONS[file.type || '']
  if (!extension) throw createError({ statusCode: 400, statusMessage: 'The preview frame must be a JPEG or PNG image' })
  if (file.data.length > MAX_FRAME_BYTES) throw createError({ statusCode: 400, statusMessage: 'The preview frame exceeds the 10MB size limit' })

  const key = `video-asset-thumbnails/${assetProject.projectId}/${id}/${Date.now()}-${randomUUID()}.${extension}`
  await uploadFile(file.data, key, file.type!, { projectId: assetProject.projectId, sourceAssetId: id, kind: 'asset-thumbnail' })
  const result = await setVideoAssetThumbnailIfMissing(id, key)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  setResponseStatus(event, result.saved ? 201 : 200)
  return {
    // False when the asset already had a frame: that one is kept.
    saved: result.saved,
    thumbnailUrl: `/api/agency/video/assets/${encodeURIComponent(id)}/thumbnail`
  }
}))
