import { z } from 'zod'
import { requireTimelinePrecondition } from '~~/server/utils/audio/timelineRevision'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaTimelineSave } from '~~/server/utils/audio/godModeMutations'
import { getProjectWithCurrentTimeline, getCurrentTimelineIfMatchingIn, saveDraftTimelineIfCurrentIn, restoreTimelineVersionIn, assertMediaProjectAccess } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'

const BodySchema = z.object({ state: z.unknown().optional(), restoreTimelineId: z.string().uuid().optional() })
  .refine(value => (value.state !== undefined) !== (value.restoreTimelineId !== undefined), { message: 'Provide timeline state or a saved version to restore' })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const raw = await readBody(event)
  const precondition = requireTimelinePrecondition(raw)
  const parsedBody = BodySchema.safeParse(raw)
  if (!parsedBody.success) throw createError({ statusCode: 400, statusMessage: 'Provide timeline state or a valid saved version to restore' })
  const body = parsedBody.data

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(user, existing.project)
  // §6: only the current draft pointer is mutable in place.
  if (existing.project.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'Project is not editable — duplicate to a new version first' })
  }
  const timelineId = existing.project.currentTimelineId
  if (!timelineId) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no draft timeline' })
  }

  if (body.restoreTimelineId) {
    const timeline = await executeGodModeMediaTimelineSave(event,
      db => restoreTimelineVersionIn(db, { projectId: id, actor: user, ...precondition, restoreTimelineId: body.restoreTimelineId! }),
      (db, resultReference) => getCurrentTimelineIfMatchingIn(db, { projectId: id, actor: user, expectedTimelineId: resultReference, expectedEditRevision: precondition.expectedEditRevision + 1 }))
    return { timeline }
  }

  const parsed = TimelineStateSchema.safeParse(body.state)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  // Owners (always God mode) run this under the execution-ledger coordinator;
  // ordinary staff hit the same transaction boundary without a ledger claim.
  const timeline = await executeGodModeMediaTimelineSave(
    event,
    db => saveDraftTimelineIfCurrentIn(db, { projectId: id, actor: user, ...precondition, state: parsed.data }),
    (db, resultReference) => getCurrentTimelineIfMatchingIn(db, {
      projectId: id, actor: user,
      expectedTimelineId: resultReference,
      expectedEditRevision: precondition.expectedEditRevision + 1
    })
  )
  return { timeline }
})
