import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { createMondayClient } from '~~/server/utils/mondayClient'
import {
  buildMondayBoardPreview,
  MondayBoardPreviewRequestSchema
} from '~~/server/utils/mondayBoardPreview'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const parsed = MondayBoardPreviewRequestSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    pageSize: getQuery(event).pageSize
  })
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday board preview request'
    })
  }

  try {
    const client = await createMondayClient()
    const board = await client.getBoard(parsed.data.boardId)
    if (!board) {
      throw createError({ statusCode: 404, statusMessage: 'Monday board not found' })
    }

    const page = await client.getItems(parsed.data.boardId, { limit: parsed.data.pageSize })
    return buildMondayBoardPreview({
      board,
      items: page.items,
      pageSize: parsed.data.pageSize,
      isTruncated: Boolean(page.cursor)
    })
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-board-preview] provider request failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday board preview unavailable'
    })
  }
})
