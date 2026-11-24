import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getAiGatewayGenerationPolicyStatus } from '~~/server/utils/aiGatewayGenerationPolicy'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { assertLayerImportPicture, createLayerImportJob, findLayerImportSource, requireLayerImportSourceAccess } from '~~/server/utils/banner/layerImport'
import { markAssetIntelligenceJobFailed } from '~~/server/utils/video-asset-intelligence/db'
import { getAssetIntelligenceQueue } from '~~/server/utils/video-asset-intelligence/enqueue'
import { defaultModelForAction } from '~~/server/utils/video-asset-intelligence/registry'

const BodySchema = z.object({
  assetId: z.string().uuid().nullable().optional(),
  /** A layer's picture address, when the import starts from a layer instead of the library. */
  src: z.string().max(2000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional()
}).refine(body => body.assetId || body.src, { message: 'Choose a picture to import.' })

/** Queues the Separate layers job for a Banner Studio upload. Billed per run through AI Gateway. */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  const asset = await findLayerImportSource(body)
  if (!asset) {
    throw createError({ statusCode: 404, statusMessage: body.assetId ? 'Picture not found' : 'Upload this picture to Media first, then import it as layers.' })
  }
  await requireLayerImportSourceAccess(event, user, asset)
  assertLayerImportPicture(asset)

  // The same operator control as video generation and the Prepare layer tools,
  // read from the deployed environment only.
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env ?? {}
  if (!getAiGatewayGenerationPolicyStatus(env).spendLimitConfirmed) {
    throw createError({ statusCode: 409, statusMessage: 'Import as layers is switched off until the AI Gateway spend limit is confirmed.' })
  }

  const queue = getAssetIntelligenceQueue(event)
  if (!queue) {
    throw createError({ statusCode: 503, statusMessage: 'Import as layers is not available here: the job queue is not connected.' })
  }

  const model = defaultModelForAction('layer-decomposition')
  const job = await createLayerImportJob({ projectId: body.projectId ?? asset.id, bannerAssetId: asset.id, createdBy: user.id })
  const message = { jobId: job.id, projectId: body.projectId ?? asset.id, sourceAssetId: asset.id }
  let enqueueError: string | null = null
  try {
    await queue.send(message)
  } catch (error) {
    enqueueError = error instanceof Error ? error.message : 'Failed to queue the import'
    await markAssetIntelligenceJobFailed(job.id, 'The import could not be queued. Try again.')
  }
  await recordAiInvocation({
    featureKey: 'banner_image_layer_decomposition',
    provider: model?.provider ?? 'aigateway',
    modelId: model?.id ?? 'unknown',
    gatewayUsed: true,
    userId: user.id,
    status: enqueueError ? 'error' : 'success',
    errorCode: enqueueError ? 'banner_layer_import_enqueue_failed' : null,
    metadata: { jobId: job.id, bannerAssetId: asset.id, projectId: body.projectId ?? null, ...(enqueueError ? { errorMessage: enqueueError } : {}) }
  })
  if (enqueueError) throw createError({ statusCode: 503, statusMessage: 'The import could not be queued. Try again.' })

  setResponseStatus(event, 202)
  return { jobId: job.id, status: 'queued' as const, asset: { id: asset.id, name: asset.name } }
})
