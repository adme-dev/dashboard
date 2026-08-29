import { listBoardFiles, resolveAccessibleBoard } from '~~/server/utils/boardFiles'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const board = await resolveAccessibleBoard(event, boardId)
  return listBoardFiles(board.id, board.user)
})
