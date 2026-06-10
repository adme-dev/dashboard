import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { queryOne } from '~~/server/utils/db'
import { generateGroqInsight } from '~~/server/utils/groqClient'
import { buildVideoStudioSocialDraft } from '~~/server/utils/socialVideoDraft'
import { videoAssetPublicUrl } from '~~/server/utils/video/assetLinks'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!

  const row = await queryOne(`SELECT va.*, vg.prompt AS generation_prompt, vg.model_id AS generation_model_id
    FROM video_assets va
    LEFT JOIN video_generation_jobs vg ON vg.output_asset_id = va.id OR vg.id = va.source_job_id
    WHERE va.id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  const asset = mapVideoAssetRow(row)

  let clientId = asset.clientId
  if (!clientId && asset.sourceProjectId) {
    const project = await getProjectWithCurrentTimeline(asset.sourceProjectId)
    clientId = project?.project.clientId ?? null
  }
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'This video has no client; assign a client before publishing to social.' })

  const config = useRuntimeConfig()
  const baseUrl = (config.public as { appUrl?: string }).appUrl || process.env.APP_URL || ''
  const mediaUrl = await videoAssetPublicUrl(asset.id, baseUrl)
  const draft = await buildVideoStudioSocialDraft({
    clientId,
    createdBy: user.id,
    mediaUrl,
    format: asset.format,
    projectId: asset.sourceProjectId ?? '',
    jobId: asset.sourceJobId,
    assetId: asset.id,
    prompt: asset.generationPrompt,
    modelId: asset.generationModelId,
    captionGenerator: async ({ topic, platform, tone }) => generateGroqInsight(
      [
        `Write a ${tone} organic social media post for ${platform}.`,
        `Topic / brief: ${topic}`,
        'Return ONLY the post copy.',
      ].join('\n'),
      {
        temperature: 0.7,
        maxTokens: 400,
        systemPrompt: 'You are an expert social media copywriter for a digital marketing agency. Output only the caption text.',
      },
    ),
  })

  const post = await queryOne<{ id: string }>(
    `INSERT INTO social_posts (client_id, created_by, content, media_urls, platforms, tags, status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [clientId, user.id, draft.content, draft.mediaUrls, draft.platforms, draft.tags, JSON.stringify(draft.metadata)],
  )
  if (!post) throw new Error('failed to create social post draft')
  return { postId: post.id, clientId }
})
