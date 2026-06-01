import { requireWriteAccess } from '~~/server/utils/auth'
import { getAsset } from '~~/server/utils/audio/assets'

// Poll a music job. The audio-jobs worker advances the row
// queued → processing → done|failed and uploads the master on success; this
// returns the current status plus a playback URL once a master exists.
export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing asset id' })
  }

  const asset = await getAsset(id)
  if (!asset || asset.kind !== 'music') {
    throw createError({ statusCode: 404, statusMessage: 'Music asset not found' })
  }

  return {
    status: asset.status,
    streamUrl: asset.streamUrl ?? null,
    error: asset.error ?? null,
    asset
  }
})
