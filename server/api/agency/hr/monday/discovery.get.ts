import { setHeader, getQuery } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const connection = await resolveMondayConnection()
  if (!connection) return { connected: false, boards: [] }
  const query = getQuery(event)
  const requestedBoard = typeof query.boardId === 'string' ? query.boardId : undefined
  const client = await createMondayClient(connection.accessToken)
  const requested = requestedBoard ? await client.getBoard(requestedBoard) : null
  const boards = requestedBoard ? (requested ? [requested] : []) : await client.getBoards({ state: 'all', limit: 500 })
  const manifest = []
  for (const board of boards) {
    if (!board) continue
    const detail = board.columns ? board : await client.getBoard(board.id)
    const firstPage = await client.getItems(board.id, { limit: 100 })
    const items = firstPage.items
    const types = new Map<string, number>()
    for (const item of items) for (const column of item.column_values ?? []) types.set(column.type, (types.get(column.type) ?? 0) + 1)
    manifest.push({ id: board.id, name: board.name, state: board.state, type: board.type, workspaceId: board.workspace_id, groups: detail?.groups ?? [], columns: (detail?.columns ?? []).map(column => ({ id: column.id, title: column.title, type: column.type })), sample: { items: items.length, itemIds: items.slice(0, 20).map(item => item.id), columnValueTypes: Object.fromEntries(types) } })
  }
  return { connected: true, account: { id: connection.accountId, name: connection.accountName }, source: connection.source, generatedAt: new Date().toISOString(), boardCount: manifest.length, boards: manifest, limitations: ['Read-only discovery; no records are imported', 'Item sample is capped at 100 per board', 'Updates and assets require a separate bounded fetch'] }
})
