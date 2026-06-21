/**
 * Observe & Learn W-3 transparency panel (observe-and-learn spec §4 W-3). Lists what the assistant has
 * learned: the caller's OWN observed memories (source='observed', deletable) and the department/org
 * memories visible to them (read-only — curated, not theirs to delete). STRICTLY caller-scoped: the
 * observed list is user_id-filtered; the shared list is limited to the caller's departments + org.
 * GET /api/agency/ai/my-assistant/memories
 */
import { requireAuth } from '~~/server/utils/auth'
import { listUserMemoriesBySource, listSharedMemories, listUserDepartments } from '~~/server/utils/ai/memory/store'
import type { UserMemory } from '~~/server/utils/ai/memory/types'

type MemoryView = {
  id: string
  content: string
  memType: string
  scope: string
  source: string
  salience: number
  createdAt: string
}

const toView = (m: UserMemory): MemoryView => ({
  id: m.id,
  content: m.content,
  memType: m.mem_type,
  scope: m.scope,
  source: m.source,
  salience: m.salience,
  createdAt: m.created_at
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const departmentIds = await listUserDepartments(user.id)
  const [observed, shared] = await Promise.all([
    listUserMemoriesBySource(user.id, 'observed', 100),
    listSharedMemories(departmentIds, 100)
  ])

  return {
    observed: observed.map(toView),
    shared: shared.map(toView)
  }
})
