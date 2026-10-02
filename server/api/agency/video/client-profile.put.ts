import { requirePermission, requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { VideoClientProfileSchema } from '~~/server/utils/video-generation/clientProfile'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  await requirePermission(event, 'MANAGEMENT')
  const parsed = z.object({ projectId: z.string().uuid(), profile: VideoClientProfileSchema }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid video client settings', data: { errors: parsed.error.issues.map(i => i.message) } })
  const { projectId, profile: p } = parsed.data
  const project = await getProjectWithCurrentTimeline(projectId)
  if (!project || project.project.mediaType !== 'av') throw createError({ statusCode: 404, statusMessage: 'Video project not found' })
  if (!canUseVideoGenerationProject(user, project.project)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const clientId = project.project.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Assign a client first' })
  await requireSocialClientAccess(event, clientId)
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended(\'videogen:budget:\' || $1::text, 0))', [clientId])
    await db.query(`INSERT INTO client_video_generation_profiles
      (client_id,enabled,monthly_cap_cents,allowed_model_ids,brand_name,brand_website,style_guide,template_prompt,social_brief,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (client_id) DO UPDATE SET
      enabled=EXCLUDED.enabled,monthly_cap_cents=EXCLUDED.monthly_cap_cents,allowed_model_ids=EXCLUDED.allowed_model_ids,
      brand_name=EXCLUDED.brand_name,brand_website=EXCLUDED.brand_website,style_guide=EXCLUDED.style_guide,
      template_prompt=EXCLUDED.template_prompt,social_brief=EXCLUDED.social_brief,updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [clientId, p.enabled, p.monthlyCapCents, JSON.stringify(p.allowedModelIds), p.brandName, p.brandWebsite, p.styleGuide, p.templatePrompt, p.socialBrief, user.id])
  })
  return { saved: true }
})
