import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaTimelineSave } from '~~/server/utils/audio/godModeMutations'
import { getProjectWithCurrentTimeline, getTimelineIn, saveDraftTimelineIn } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'

const BodySchema = z.object({ state: z.unknown() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!canUseVideoGenerationProject(user, existing.project)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  if (existing.project.clientId) await requireSocialClientAccess(event, existing.project.clientId)
  // §6: only the highest-version row of a draft project is mutable in place.
  if (existing.project.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'Project is not editable — duplicate to a new version first' })
  }
  const timelineId = existing.project.currentTimelineId
  if (!timelineId) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no draft timeline' })
  }

  const parsed = TimelineStateSchema.safeParse(body.state)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  // A project may have been reassigned since this version was saved. Discard
  // campaign metadata from the previous client; never reuse it for the new one.
  if (parsed.data.campaign_prompt?.clientId !== existing.project.clientId) delete parsed.data.campaign_prompt
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  // Owners (always God mode) run this under the execution-ledger coordinator;
  // ordinary staff hit the same transaction boundary without a ledger claim.
  const timeline = await executeGodModeMediaTimelineSave(
    event,
    async (db) => {
      const current = (await db.query('SELECT client_id, current_timeline_id, status FROM media_projects WHERE id = $1 FOR UPDATE', [id])).rows[0]
      if (!current || current.client_id !== existing.project.clientId || current.current_timeline_id !== timelineId || current.status !== 'draft') {
        throw createError({ statusCode: 409, statusMessage: 'Project changed. Reload before saving.' })
      }
      return saveDraftTimelineIn(db, timelineId, parsed.data)
    },
    async (db, resultReference) => {
      const replayed = await getTimelineIn(db, resultReference)
      if (!replayed) throw createError({ statusCode: 409, statusMessage: 'Saved timeline no longer exists' })
      return replayed
    }
  )
  return { timeline }
})
