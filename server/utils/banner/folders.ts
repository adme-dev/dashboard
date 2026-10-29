import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'

export async function resolveBannerFolderId(value: unknown): Promise<string | null> {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid folder' })
  }
  const folder = await queryOneFresh('SELECT id FROM banner_folders WHERE id = $1', [value])
  if (!folder) throw createError({ statusCode: 400, statusMessage: 'Folder no longer exists' })
  return folder.id
}
