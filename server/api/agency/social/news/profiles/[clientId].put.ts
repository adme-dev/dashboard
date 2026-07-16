/** PUT /api/agency/social/news/profiles/:clientId — save the durable client content profile. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { normalizeSocialNewsClientProfile } from '~~/server/utils/socialNewsProfile'
import { embedSocialClientKnowledge } from '~~/server/utils/aiEntityEmbedder'
import { runAfterResponse } from '~~/server/utils/asyncBackground'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const profile = normalizeSocialNewsClientProfile(await readBody<Record<string, unknown>>(event))
  if (profile.sourceBriefId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profile.sourceBriefId)) {
      throw createError({ statusCode: 400, statusMessage: 'sourceBriefId must be a UUID' })
    }
    const brief = await queryOne<{ id: string }>('SELECT id FROM briefs WHERE id = $1 AND client_id = $2', [profile.sourceBriefId, clientId])
    if (!brief) throw createError({ statusCode: 400, statusMessage: 'Source brief does not belong to this client' })
  }
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO social_news_client_profiles
       (client_id, source_brief_id, industry, target_audience, content_pillars, include_keywords,
        exclude_keywords, makes, brand_voice, default_tone, ai_instructions, preferred_platforms,
        timezone, default_workflow, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (client_id) DO UPDATE SET
       source_brief_id = EXCLUDED.source_brief_id, industry = EXCLUDED.industry,
       target_audience = EXCLUDED.target_audience, content_pillars = EXCLUDED.content_pillars,
       include_keywords = EXCLUDED.include_keywords, exclude_keywords = EXCLUDED.exclude_keywords,
       makes = EXCLUDED.makes, brand_voice = EXCLUDED.brand_voice,
       default_tone = EXCLUDED.default_tone, ai_instructions = EXCLUDED.ai_instructions,
       preferred_platforms = EXCLUDED.preferred_platforms, timezone = EXCLUDED.timezone,
       default_workflow = EXCLUDED.default_workflow,
       knowledge_embedding_id = NULL, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *`,
    [clientId, profile.sourceBriefId, profile.industry || null, profile.targetAudience || null,
      profile.contentPillars, profile.includeKeywords, profile.excludeKeywords, profile.makes,
      profile.brandVoice || null, profile.defaultTone, profile.aiInstructions || null,
      profile.preferredPlatforms, profile.timezone, profile.defaultWorkflow, user.id],
  )
  runAfterResponse(event, embedSocialClientKnowledge(event, clientId), 'social-news-client-knowledge-index')
  return normalizeSocialNewsClientProfile({ ...(row || {}), client_id: clientId })
})
