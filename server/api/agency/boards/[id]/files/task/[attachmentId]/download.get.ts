import { resolveAccessibleBoard } from '~~/server/utils/boardFiles'
import { queryOne } from '~~/server/utils/db'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const attachmentId = getRouterParam(event, 'attachmentId')
  if (!boardId || !attachmentId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and attachment ID are required' })
  }

  const board = await resolveAccessibleBoard(event, boardId)
  const file = await queryOne<{ storage_key: string | null; file_url: string }>(`
    SELECT ta.storage_key, ta.file_url
    FROM task_attachments ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE ta.id = $1 AND t.department_id = $2
  `, [attachmentId, board.id])
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'Task attachment not found' })
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
