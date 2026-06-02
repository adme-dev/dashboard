import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createProject } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'

const BodySchema = z.object({
  title: z.string().max(200).nullish(),
  clientId: z.string().guid().nullish(),
  // Optional seed timeline; defaults to an empty audio timeline when omitted.
  initialState: z.unknown().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  // Normalize the seed (or build an empty one) via the contract, then run the
  // referential/semantic check before any DB write.
  const parsed = TimelineStateSchema.safeParse(body.initialState ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (!check.ok) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const { project, timeline } = await createProject({
    createdBy: user.id,
    clientId: body.clientId ?? null,
    title: body.title ?? null,
    initialState: parsed.data
  })

  setResponseStatus(event, 201)
  return { project, timeline }
})
