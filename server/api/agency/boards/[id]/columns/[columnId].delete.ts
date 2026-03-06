import { queryOne, query } from '../../../../../utils/db'
import { kvDelete } from '~~/server/utils/kv'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const columnId = getRouterParam(event, 'columnId')
  
  if (!boardId || !columnId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing board or column ID' })
  }

  // Verify the column belongs to this board
  const column = await queryOne(`
    SELECT bc.id, bc.department_id, d.workspace_id
    FROM board_columns bc
    JOIN departments d ON bc.department_id = d.id
    WHERE bc.id = $1::uuid 
    AND (d.id = $2::uuid OR d.slug = $2)
  `, [columnId, boardId])

  if (!column) {
    throw createError({ statusCode: 404, statusMessage: 'Column not found' })
  }

  // Delete column values first (foreign key constraint)
  await query(`
    DELETE FROM task_monday_column_values 
    WHERE column_id = $1::uuid
  `, [columnId])

  // Delete the column
  await query(`
    DELETE FROM board_columns 
    WHERE id = $1::uuid
  `, [columnId])

  // Invalidate columns cache
  if (boardId) {
    kvDelete(event, `board:${boardId}:columns`)
    kvDelete(event, `board:${boardId}:columns:all`)
  }

  return { success: true }
})
