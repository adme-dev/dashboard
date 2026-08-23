import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { queryOne } from '~~/server/utils/db'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { buildVideoStudioSocialDraft } from '~~/server/utils/socialVideoDraft'
import { videoAssetPublicUrl } from '~~/server/utils/video/assetLinks'
import { getAccessibleVideoAsset } from '~~/server/utils/video/assets'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'assetPublishSocial', async () => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!

  const asset = await getAccessibleVideoAsset(id, user)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

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
    captionGenerator: async ({ topic, platform, tone }) => generateModelRoutedGroqInsight(
      [
        `Write a ${tone} organic social media post for ${platform}.`,
        `Topic / brief: ${topic}`,
        'Return ONLY the post copy.',
      ].join('\n'),
      {
        defaultModelId: GROQ_MODELS.LLAMA_70B,
        temperature: 0.7,
        maxTokens: 400,
        featureKey: 'video_asset_publish_social_caption',
        userId: user.id,
        clientId,
        requestId: asset.id,
        metadata: {
          route: '/api/agency/video/assets/:id/publish-social',
          assetId: asset.id,
          projectId: asset.sourceProjectId ?? null,
          jobId: asset.sourceJobId ?? null,
          format: asset.format,
          modelId: asset.generationModelId ?? null,
          platform,
          tone,
        },
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
}))
