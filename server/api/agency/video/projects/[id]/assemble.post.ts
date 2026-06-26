import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { buildReviewableAssemblyPlan } from '~~/server/utils/video-asset-intelligence/buckets'
import { buildAssemblyPrompt, parseAssemblyAiResponse, planFromAiAssembly, usableBucketItems, withProducerLaneSteps } from '~~/server/utils/video-asset-intelligence/aiAssembly'
import { ensureDefaultBuckets, listBucketItemsForProject } from '~~/server/utils/video-asset-intelligence/db'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'

const BodySchema = z.object({
  brief: z.string().min(1).max(4000),
  targetFormat: z.string().min(1).max(80).default('reels_9x16'),
  selectedAsset: z.object({
    id: z.string().max(200).optional().nullable(),
    title: z.string().max(500).optional().nullable(),
    type: z.string().max(80).optional().nullable(),
    source: z.string().max(80).optional().nullable(),
    prompt: z.string().max(2000).optional().nullable(),
    transcript: z.string().max(4000).optional().nullable(),
  }).optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  const body = BodySchema.parse(await readBody(event))
  await requireVideoProjectWriteAccess(user, projectId, 'AI assembly requires an AV project')
  await ensureDefaultBuckets(projectId)
  const bucketItems = await listBucketItemsForProject(projectId)

  // Conversational pass: Groq selects/orders/durations the assets against the
  // brief and explains the cut. Any failure (no key, timeout, unusable JSON)
  // falls back to the mechanical first-N plan — the endpoint never breaks.
  const usable = usableBucketItems(bucketItems)
  if (usable.length) {
    try {
      const response = await generateModelRoutedGroqInsight(
        buildAssemblyPrompt({ brief: body.brief, targetFormat: body.targetFormat, items: usable, selectedAsset: body.selectedAsset }),
        {
          defaultModelId: GROQ_MODELS.LLAMA_70B,
          temperature: 0.2,
          maxTokens: 1200,
          featureKey: 'video_project_ai_assembly',
          userId: user.id,
          requestId: projectId,
          metadata: {
            route: '/api/agency/video/projects/:id/assemble',
            projectId,
            targetFormat: body.targetFormat,
            usableItemCount: usable.length,
            bucketItemCount: bucketItems.length,
            hasSelectedAsset: Boolean(body.selectedAsset),
            briefChars: body.brief.length,
          },
          systemPrompt: 'You are a senior video producer assembling a social edit from a fixed asset list. Respond with ONLY the requested JSON.'
        }
      )
      const ai = parseAssemblyAiResponse(response, bucketItems)
      if (ai) {
        const plan = planFromAiAssembly({ projectId, brief: body.brief, targetFormat: body.targetFormat, items: usable, ai })
        return { plan: withProducerLaneSteps(plan, { brief: body.brief, items: bucketItems, selectedAsset: body.selectedAsset }) }
      }
    } catch (error) {
      console.error('AI assembly fell back to mechanical plan:', error)
    }
  }

  const plan = buildReviewableAssemblyPlan({ projectId, brief: body.brief, targetFormat: body.targetFormat, bucketItems })
  return { plan: withProducerLaneSteps(plan, { brief: body.brief, items: bucketItems, selectedAsset: body.selectedAsset }) }
})
