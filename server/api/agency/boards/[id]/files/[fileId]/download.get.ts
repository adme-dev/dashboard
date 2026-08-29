import { resolveAccessibleBoard } from '~~/server/utils/boardFiles'
import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const fileId = getRouterParam(event, 'fileId')
  if (!boardId || !fileId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and file ID are required' })
  }

  const board = await resolveAccessibleBoard(event, boardId)
  const file = await queryOne<{ storage_key: string | null, file_url: string }>(`
    SELECT storage_key, file_url
    FROM board_files
    WHERE id = $1 AND department_id = $2
  `, [fileId, board.id])
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'Board file not found' })
  }

  let url = file.file_url
  if (file.storage_key) {
    url = getPublicUrl(file.storage_key)
      || (isStorageConfigured()
        ? await getPresignedDownloadUrl(file.storage_key, 900)
        : file.file_url)
  }

  return sendRedirect(event, url, 302)
})
