import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveAccessibleBoard } from '~~/server/utils/boardFiles'
import { prepareKnowledgeSourceDeletion } from '~~/server/utils/boardKnowledge/deletion'
import { queryOne } from '~~/server/utils/db'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const boardId = getRouterParam(event, 'id')
  const fileId = getRouterParam(event, 'fileId')
  if (!boardId || !fileId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID and file ID are required' })
  }

  const board = await resolveAccessibleBoard(event, boardId)
  const file = await queryOne<{ id: string, uploaded_by: string | null, storage_key: string | null }>(`
    SELECT id, uploaded_by, storage_key
    FROM board_files
    WHERE id = $1 AND department_id = $2
  `, [fileId, board.id])
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'Board file not found' })
  }

  const canDelete = user.role === 'owner' || user.role === 'admin' || file.uploaded_by === user.id
  if (!canDelete) {
    throw createError({ statusCode: 403, statusMessage: 'You can only delete board files you uploaded' })
  }

  await prepareKnowledgeSourceDeletion(event, {
    departmentId: board.id,
    sourceType: 'board_file',
    sourceId: file.id,
    actorId: user.id
  })

  await queryOne(
    'DELETE FROM board_files WHERE id = $1 AND department_id = $2 RETURNING id',
    [fileId, board.id]
  )

  if (file.storage_key) {
    await deleteFile(file.storage_key).catch((error) => {
      console.warn('Failed to remove board file from storage:', error)
    })
  }

  return { success: true }
})
