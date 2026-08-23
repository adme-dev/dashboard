import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaProjectCreate } from '~~/server/utils/audio/godModeMutations'
import { createProjectIn, getProjectWithCurrentTimelineIn } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline, emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'

const BodySchema = z.object({
  title: z.string().max(200).nullish(),
  clientId: z.string().uuid().nullish(),
  mediaType: z.enum(['audio', 'av']).default('audio'),
  // Optional seed timeline; defaults to an empty audio timeline (or AV timeline for
  // AV projects) when omitted.
  initialState: z.unknown().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  // Seed: use provided initialState, or auto-seed based on mediaType.
  const seed = body.initialState ?? (body.mediaType === 'av' ? emptyAvTimeline() : {})

  // Normalize + structurally validate via the Zod contract.
  const parsed = TimelineStateSchema.safeParse(seed)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  // Referential + semantic integrity check.
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const { project, timeline } = await executeGodModeMediaProjectCreate(
    event,
    async (db) => {
      const created = await createProjectIn(db, {
        createdBy: user.id,
        clientId: body.clientId ?? null,
        title: body.title ?? null,
        mediaType: body.mediaType,
        initialState: parsed.data
      })
      return { id: created.project.id, ...created }
    },
    async (db, resultReference) => {
      const replayed = await getProjectWithCurrentTimelineIn(db, resultReference)
      if (!replayed) throw createError({ statusCode: 409, statusMessage: 'Created project no longer exists' })
      return { id: replayed.project.id, project: replayed.project, timeline: replayed.timeline! }
    }
  )

  setResponseStatus(event, 201)
  return { project, timeline }
})
