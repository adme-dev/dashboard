import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaProjectDelete } from '~~/server/utils/audio/godModeMutations'
import { assertMediaProjectAccess, deleteProjectIn, getProjectWithCurrentTimelineIn } from '~~/server/utils/audio/projects'

// DELETE /api/agency/audio/projects/:id — removes the project plus its versioned
// timelines (FK cascade) and render jobs (deleted explicitly first — their
// timeline_id FK has no cascade). All in one transaction inside deleteProjectIn.
export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const result = await executeGodModeMediaProjectDelete(
    event,
    async (db) => {
      const deleted = await deleteProjectIn(db, id, actor)
      if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      return { id }
    },
    // Replaying a completed delete is idempotent once the row is gone.
    async (db, resultReference) => {
      const replayed = await getProjectWithCurrentTimelineIn(db, resultReference)
      if (replayed) assertMediaProjectAccess(actor, replayed.project)
      return { id: resultReference }
    }
  )

  return { success: true, id: result.id }
})
