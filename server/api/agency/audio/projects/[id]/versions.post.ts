import { z } from 'zod'
import { requireTimelinePrecondition } from '~~/server/utils/audio/timelineRevision'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaVersionCreate } from '~~/server/utils/audio/godModeMutations'
import { createVersionIn, getCurrentTimelineIfMatchingIn } from '~~/server/utils/audio/projects'

const BodySchema = z.object({ label: z.string().max(200).nullish() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const raw = await readBody(event)
  const precondition = requireTimelinePrecondition(raw)
  const body = BodySchema.parse(raw)
  const timeline = await executeGodModeMediaVersionCreate(
    event,
    db => createVersionIn(db, { projectId: id, actor: user, ...precondition, label: body.label ?? null }),
    (db, resultReference) => getCurrentTimelineIfMatchingIn(db, {
      projectId: id, actor: user,
      expectedTimelineId: resultReference, expectedEditRevision: 0
    })
  )
  setResponseStatus(event, 201)
  return { timeline }
})
