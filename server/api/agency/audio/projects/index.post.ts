import { z } from 'zod'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeMediaProjectCreate } from '~~/server/utils/audio/godModeMutations'
import { createProjectIn, getProjectWithCurrentTimeline, getProjectWithCurrentTimelineIn } from '~~/server/utils/audio/projects'
import { CampaignPromptSchema, TimelineStateSchema, validateTimeline, emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { assertSocialCampaign } from '~~/server/utils/socialPublishing/campaigns'

const BodySchema = z.object({
  title: z.string().max(200).nullish(),
  clientId: z.string().uuid().nullish(),
  mediaType: z.enum(['audio', 'av']).default('audio'),
  // Optional seed timeline; defaults to an empty audio timeline (or AV timeline for
  // AV projects) when omitted.
  initialState: z.unknown().optional(),
  campaignSourceProjectId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))
  if (body.clientId) await requireSocialClientAccess(event, body.clientId)

  // Seed: use provided initialState, or auto-seed based on mediaType.
  let seed = body.initialState ?? (body.mediaType === 'av' ? emptyAvTimeline() : {})
  let source: Awaited<ReturnType<typeof getProjectWithCurrentTimeline>> = null
  if (body.campaignSourceProjectId) {
    if (body.mediaType !== 'av' || !body.clientId || body.initialState !== undefined) {
      throw createError({ statusCode: 400, statusMessage: 'Reuse requires a client video project without a seed timeline' })
    }
    source = await getProjectWithCurrentTimeline(body.campaignSourceProjectId)
    if (!source) throw createError({ statusCode: 404, statusMessage: 'Source project not found' })
    if (!canUseVideoGenerationProject(user, source.project)) throw createError({ statusCode: 403, statusMessage: 'Source project access denied' })
    const saved = CampaignPromptSchema.safeParse(source.timeline?.state.campaign_prompt)
    if (source.project.mediaType !== 'av' || source.project.clientId !== body.clientId || !saved.success || saved.data.clientId !== body.clientId) {
      throw createError({ statusCode: 400, statusMessage: 'Source project has no saved campaign settings for this client' })
    }
    seed = { ...emptyAvTimeline(), campaign_prompt: saved.data }
  }

  // Normalize + structurally validate via the Zod contract.
  const parsed = TimelineStateSchema.safeParse(seed)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  if (parsed.data.media_type !== body.mediaType) throw createError({ statusCode: 400, statusMessage: 'Timeline and project types must match' })
  if (parsed.data.campaign_prompt) {
    if (parsed.data.campaign_prompt.clientId !== body.clientId) throw createError({ statusCode: 400, statusMessage: 'Campaign settings must belong to the project client' })
    await assertSocialCampaign(parsed.data.campaign_prompt.clientId, parsed.data.campaign_prompt.campaignId)
  }
  // Referential + semantic integrity check.
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const { project, timeline } = await executeGodModeMediaProjectCreate(
    event,
    async (db) => {
      if (source) {
        const locked = await db.query<{ client_id: string | null, current_timeline_id: string | null, created_by: string, media_type: string }>(
          'SELECT client_id, current_timeline_id, created_by, media_type FROM media_projects WHERE id = $1 FOR SHARE', [source.project.id]
        )
        const row = locked.rows[0]
        if (!row || row.client_id !== body.clientId || row.current_timeline_id !== source.project.currentTimelineId || row.created_by !== source.project.createdBy || row.media_type !== 'av') {
          throw createError({ statusCode: 409, statusMessage: 'Source project changed; refresh and try again' })
        }
        // Autosave changes the state in place. Read again after locking the
        // project so a completed save cannot supply stale campaign guidance.
        const current = await db.query<{ campaign_prompt: unknown }>(
          "SELECT state->'campaign_prompt' AS campaign_prompt FROM media_timelines WHERE id = $1 FOR SHARE", [row.current_timeline_id]
        )
        const settings = CampaignPromptSchema.safeParse(current.rows[0]?.campaign_prompt)
        if (!settings.success || JSON.stringify(settings.data) !== JSON.stringify(parsed.data.campaign_prompt)) {
          throw createError({ statusCode: 409, statusMessage: 'Source campaign settings changed; refresh and try again' })
        }
      }
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
