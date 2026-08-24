import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { mergeSocialPackageProfile } from '~~/server/utils/socialNewsGovernance'
import { embedSocialClientKnowledge } from '~~/server/utils/aiEntityEmbedder'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { enqueue } from '~~/server/utils/queue'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const body = await readBody<{ packageVersionId?: string; projectId?: string | null; rateCardItemId?: string | null; budgetAllocationId?: string | null; startsOn?: string; endsOn?: string | null }>(event)
  if (!isSocialClientId(body.packageVersionId)) throw createError({ statusCode: 400, statusMessage: 'Valid packageVersionId required' })
  for (const [name, id] of Object.entries({ projectId: body.projectId, rateCardItemId: body.rateCardItemId, budgetAllocationId: body.budgetAllocationId })) {
    if (id && !isSocialClientId(id)) throw createError({ statusCode: 400, statusMessage: `Invalid ${name}` })
  }
  const version = await queryOne<{ id: string; profile_defaults: Record<string, unknown>; commercial_scope: Record<string, unknown> }>(
    `SELECT id, profile_defaults, commercial_scope FROM social_content_package_versions
      WHERE id = $1 AND status = 'published'`, [body.packageVersionId],
  )
  if (!version) throw createError({ statusCode: 400, statusMessage: 'Published package version not found' })
  if (body.projectId && !await queryOne('SELECT id FROM projects WHERE id = $1 AND client_id = $2', [body.projectId, clientId])) {
    throw createError({ statusCode: 400, statusMessage: 'Project does not belong to this client' })
  }
  if (body.rateCardItemId && !await queryOne('SELECT id FROM rate_card_items WHERE id = $1 AND is_active = TRUE', [body.rateCardItemId])) {
    throw createError({ statusCode: 400, statusMessage: 'Active rate-card item not found' })
  }
  if (body.budgetAllocationId && !await queryOne(
    `SELECT ba.id FROM job_budget_allocations ba JOIN projects p ON p.id = ba.project_id
      WHERE ba.id = $1 AND p.client_id = $2`, [body.budgetAllocationId, clientId],
  )) throw createError({ statusCode: 400, statusMessage: 'Budget allocation does not belong to this client' })

  const currentProfile = await queryOne<Record<string, unknown>>('SELECT * FROM social_news_client_profiles WHERE client_id = $1', [clientId])
  const profileSnapshot = mergeSocialPackageProfile(version.profile_defaults || {}, currentProfile, clientId)
  const startsOn = body.startsOn && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : new Date().toISOString().slice(0, 10)
  const endsOn = body.endsOn && /^\d{4}-\d{2}-\d{2}$/.test(body.endsOn) ? body.endsOn : null
  const row = await queryOne(
    `WITH ended AS (
       UPDATE social_content_package_assignments SET status = 'ended', ended_at = NOW(), updated_at = NOW()
        WHERE client_id = $1 AND status = 'active'
     ), assigned AS (
       INSERT INTO social_content_package_assignments
         (client_id, package_version_id, project_id, rate_card_item_id, budget_allocation_id,
          profile_snapshot, commercial_scope_snapshot, starts_on, ends_on, assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
       RETURNING id, client_id, package_version_id, project_id, rate_card_item_id,
                 budget_allocation_id, profile_snapshot, commercial_scope_snapshot, starts_on, ends_on, status
     ), seeded_profile AS (
       INSERT INTO social_news_client_profiles
         (client_id, source_brief_id, industry, target_audience, content_pillars, include_keywords,
          exclude_keywords, makes, brand_voice, default_tone, ai_instructions, preferred_platforms,
          timezone, default_workflow, updated_by)
       VALUES (
         $1, NULLIF($6::jsonb->>'sourceBriefId', '')::uuid,
         NULLIF($6::jsonb->>'industry', ''), NULLIF($6::jsonb->>'targetAudience', ''),
         ARRAY(SELECT jsonb_array_elements_text($6::jsonb->'contentPillars')),
         ARRAY(SELECT jsonb_array_elements_text($6::jsonb->'includeKeywords')),
         ARRAY(SELECT jsonb_array_elements_text($6::jsonb->'excludeKeywords')),
         ARRAY(SELECT jsonb_array_elements_text($6::jsonb->'makes')),
         NULLIF($6::jsonb->>'brandVoice', ''), COALESCE(NULLIF($6::jsonb->>'defaultTone', ''), 'professional'),
         NULLIF($6::jsonb->>'aiInstructions', ''),
         ARRAY(SELECT jsonb_array_elements_text($6::jsonb->'preferredPlatforms')),
         COALESCE(NULLIF($6::jsonb->>'timezone', ''), 'Australia/Melbourne'),
         CASE WHEN $6::jsonb->>'defaultWorkflow' = 'schedule' THEN 'schedule' ELSE 'draft' END,
         $10
       )
       ON CONFLICT (client_id) DO UPDATE SET
         source_brief_id = EXCLUDED.source_brief_id, industry = EXCLUDED.industry,
         target_audience = EXCLUDED.target_audience, content_pillars = EXCLUDED.content_pillars,
         include_keywords = EXCLUDED.include_keywords, exclude_keywords = EXCLUDED.exclude_keywords,
         makes = EXCLUDED.makes, brand_voice = EXCLUDED.brand_voice,
         default_tone = EXCLUDED.default_tone, ai_instructions = EXCLUDED.ai_instructions,
         preferred_platforms = EXCLUDED.preferred_platforms, timezone = EXCLUDED.timezone,
         default_workflow = EXCLUDED.default_workflow, knowledge_embedding_id = NULL,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING client_id
     )
     SELECT assigned.* FROM assigned JOIN seeded_profile USING (client_id)`,
    [clientId, version.id, body.projectId || null, body.rateCardItemId || null,
      body.budgetAllocationId || null, JSON.stringify(profileSnapshot), JSON.stringify(version.commercial_scope || {}),
      startsOn, endsOn, user.id],
  )
  await enqueue(event, 'embed.social.client', { clientId }, () => {
    runAfterResponse(event, embedSocialClientKnowledge(event, clientId), 'social-package-client-knowledge-index')
    return Promise.resolve()
  })
  return row
})
