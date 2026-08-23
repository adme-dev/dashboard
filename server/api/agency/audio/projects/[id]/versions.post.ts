import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaVersionCreate } from '~~/server/utils/audio/godModeMutations'
import { createVersionIn, getTimelineIn } from '~~/server/utils/audio/projects'

const BodySchema = z.object({ label: z.string().max(200).nullish() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))
  const timeline = await executeGodModeMediaVersionCreate(
    event,
    db => createVersionIn(db, { projectId: id, createdBy: user.id, label: body.label ?? null }),
    async (db, resultReference) => {
      const replayed = await getTimelineIn(db, resultReference)
      if (!replayed) throw createError({ statusCode: 409, statusMessage: 'Saved version no longer exists' })
      return replayed
    }
  )
  setResponseStatus(event, 201)
  return { timeline }
})
