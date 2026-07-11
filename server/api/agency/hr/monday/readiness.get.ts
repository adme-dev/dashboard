import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { queryOne } from '~~/server/utils/db'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const connection = await resolveMondayConnection()
  const scope = await queryOne<{ id: string; boardCount: number }>(`SELECT id, jsonb_array_length(board_ids) AS "boardCount" FROM hr_monday_evidence_scopes WHERE status = 'approved' ORDER BY approved_at DESC NULLS LAST, created_at DESC LIMIT 1`)
  const tables = await queryOne<{ syncState: string | null; knowledge: string | null }>(`SELECT to_regclass('public.hr_monday_sync_states') AS "syncState", to_regclass('public.hr_knowledge_records') AS knowledge`)
  const gates = { mondayConnection: Boolean(connection), approvedScope: Boolean(scope), syncSchema: Boolean(tables?.syncState), knowledgeSchema: Boolean(tables?.knowledge) }
  return { ready: Object.values(gates).every(Boolean), gates, scope: scope ? { id: scope.id, boardCount: Number(scope.boardCount) } : null }
})
