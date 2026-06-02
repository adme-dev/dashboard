import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, saveDraftTimeline } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'

const BodySchema = z.object({ state: z.unknown() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  // §6: only the highest-version row of a draft project is mutable in place.
  if (existing.project.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'Project is not editable — duplicate to a new version first' })
  }
  if (!existing.project.currentTimelineId) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no draft timeline' })
  }

  const parsed = TimelineStateSchema.safeParse(body.state)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (!check.ok) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const timeline = await saveDraftTimeline(existing.project.currentTimelineId, parsed.data)
  return { timeline }
})
