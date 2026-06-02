import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createVersion } from '~~/server/utils/audio/projects'

const BodySchema = z.object({ label: z.string().max(200).nullish() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))
  const timeline = await createVersion({ projectId: id, createdBy: user.id, label: body.label ?? null })
  setResponseStatus(event, 201)
  return { timeline }
})
