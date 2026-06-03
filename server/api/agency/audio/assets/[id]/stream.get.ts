import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, isStorageConfigured } from '~~/server/utils/storage'

const STREAM_TTL = 5 * 60

function localUploadUrl(key: string): string {
  return `/api/_uploads/${encodeURI(key).replace(/#/g, '%23')}`
}

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })
  }

  const row = await queryOne<{ r2_key_master: string | null }>(
    `SELECT r2_key_master FROM audio_assets WHERE id = $1`,
    [id]
  )
  const key = row?.r2_key_master
  if (!key) {
    throw createError({ statusCode: 404, statusMessage: 'Playable audio not found' })
  }

  const location = isStorageConfigured()
    ? await getPresignedDownloadUrl(key, STREAM_TTL)
    : localUploadUrl(key)

  return sendRedirect(event, location, 302)
})
