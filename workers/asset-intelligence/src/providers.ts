export interface AssetIntelligenceWorkerJob {
  id: string
  tenantId: string
  projectId: string
  sourceAssetId: string | null
  action: string
  modelId: string
  provider: string
  status?: string
  prompt: string | null
  brushMaskKey: string | null
}

export interface AssetDerivativeOutput {
  kind: string
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
  contentType?: string
  size?: number
}

export interface ProviderDeps {
  job: AssetIntelligenceWorkerJob
  env: {
    AI?: {
      run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
    }
  }
  fetchAssetBytes(sourceAssetId: string): Promise<{ dataUri: string; contentType: string }>
  copyR2Object(sourceKey: string, destinationKey: string): Promise<{ r2Key: string; contentType: string; size: number }>
  uploadJson(key: string, value: unknown): Promise<{ r2Key: string; contentType: string; size: number }>
  uploadBinary(key: string, bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<{ r2Key: string; contentType: string; size: number }>
}

export interface AssetIntelligenceProviderResult {
  derivatives: AssetDerivativeOutput[]
}

const MASK_ONLY_PROVIDER = 'replicate'
const MASK_ONLY_MODEL_ID = 'replicate/sam-2'
const WORKERS_AI_PROVIDER = 'workers-ai'
const WORKERS_AI_ANALYSIS_MODEL_ID = 'workers-ai/kimi-planner'
const WORKERS_AI_ANALYSIS_CF_MODEL = '@cf/moonshotai/kimi-k2-instruct'
const WORKERS_AI_IMAGE_MODEL_ID = 'workers-ai/flux-edit'
const WORKERS_AI_IMAGE_CF_MODEL = '@cf/black-forest-labs/flux-1-schnell'

const EXTERNAL_PROVIDER_ACTIONS = new Set([
  'background-removal',
  'object-segmentation',
  'layer-decomposition',
  'mask-lift',
])

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function imageFromDataUri(dataUri: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUri)
  if (!match) return null
  return { contentType: match[1] || 'image/png', bytes: decodeBase64(match[2] || '') }
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractGeneratedImage(value: unknown): { bytes: Uint8Array; contentType: string } {
  const direct = firstString(value)
  if (direct) {
    const directImage = imageFromDataUri(direct)
    if (directImage) return directImage
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        return extractGeneratedImage(item)
      } catch {
        // Keep scanning common provider array shapes.
      }
    }
  }

  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    for (const key of ['image', 'image_url', 'url', 'data', 'output', 'result']) {
      const nested = candidate[key]
      const text = firstString(nested)
      if (text) {
        const nestedImage = imageFromDataUri(text)
        if (nestedImage) return nestedImage
      }
      if (nested && typeof nested === 'object') {
        try {
          return extractGeneratedImage(nested)
        } catch {
          // Try the next known shape.
        }
      }
    }
  }

  throw new Error('workers-ai image edit did not return a base64 image')
}

function requireWorkersAiImageJob(job: AssetIntelligenceWorkerJob, action: string) {
  if (job.provider !== WORKERS_AI_PROVIDER) throw new Error(`${action} requires provider workers-ai`)
  if (job.modelId !== WORKERS_AI_IMAGE_MODEL_ID) {
    throw new Error(`${action} model not supported: ${job.modelId}`)
  }
  if (!job.sourceAssetId) throw new Error(`${action} jobs require sourceAssetId`)
}

function derivativeKindForWorkersAiImageAction(action: string): string {
  return action === 'thumbnail-generation' ? 'thumbnail' : 'edited-image'
}

export async function runAssetIntelligenceProvider(deps: ProviderDeps): Promise<AssetIntelligenceProviderResult> {
  const { job } = deps

  if (job.action === 'mask-only') {
    if (job.provider !== MASK_ONLY_PROVIDER || job.modelId !== MASK_ONLY_MODEL_ID) {
      throw new Error(`mask-only model not supported: ${job.provider}/${job.modelId}`)
    }
    if (!job.brushMaskKey) throw new Error('mask-only jobs require brushMaskKey')
    const destinationKey = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}/mask.png`
    const copied = await deps.copyR2Object(job.brushMaskKey, destinationKey)
    return {
      derivatives: [{
        kind: 'mask-png',
        r2Key: copied.r2Key,
        width: null,
        height: null,
        metadata: { sourceMaskKey: job.brushMaskKey },
        contentType: copied.contentType,
        size: copied.size,
      }],
    }
  }

  if (job.action === 'asset-analysis') {
    if (job.provider !== WORKERS_AI_PROVIDER) throw new Error('asset-analysis requires provider workers-ai')
    if (job.modelId !== WORKERS_AI_ANALYSIS_MODEL_ID) {
      throw new Error(`asset-analysis model not supported: ${job.modelId}`)
    }
    if (!job.sourceAssetId) throw new Error('asset-analysis jobs require sourceAssetId')
    if (!deps.env.AI) throw new Error('asset-analysis jobs require env.AI')
    const asset = await deps.fetchAssetBytes(job.sourceAssetId)
    const analysis = await deps.env.AI.run(
      WORKERS_AI_ANALYSIS_CF_MODEL,
      { prompt: job.prompt, image: asset.dataUri },
      { gateway: { metadata: { tenantId: job.tenantId, projectId: job.projectId, jobId: job.id, modelId: job.modelId } } }
    )
    const key = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}/analysis.json`
    const uploaded = await deps.uploadJson(key, {
      jobId: job.id,
      tenantId: job.tenantId,
      projectId: job.projectId,
      sourceAssetId: job.sourceAssetId,
      modelId: job.modelId,
      contentType: asset.contentType,
      analysis,
    })
    return {
      derivatives: [{
        kind: 'analysis-json',
        r2Key: uploaded.r2Key,
        width: null,
        height: null,
        metadata: { modelId: job.modelId },
        contentType: uploaded.contentType,
        size: uploaded.size,
      }],
    }
  }

  if (job.action === 'erase-fill' || job.action === 'image-edit' || job.action === 'thumbnail-generation') {
    requireWorkersAiImageJob(job, job.action)
    if (!deps.env.AI) throw new Error(`${job.action} jobs require env.AI`)
    const asset = await deps.fetchAssetBytes(job.sourceAssetId!)
    const generated = await deps.env.AI.run(
      WORKERS_AI_IMAGE_CF_MODEL,
      {
        prompt: job.prompt ?? '',
        image: asset.dataUri,
        mask: job.brushMaskKey,
      },
      { gateway: { metadata: { tenantId: job.tenantId, projectId: job.projectId, jobId: job.id, modelId: job.modelId } } }
    )
    const image = extractGeneratedImage(generated)
    const key = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}/${job.action === 'thumbnail-generation' ? 'thumbnail' : 'edited'}.png`
    const uploaded = await deps.uploadBinary(key, image.bytes, image.contentType)
    return {
      derivatives: [{
        kind: derivativeKindForWorkersAiImageAction(job.action),
        r2Key: uploaded.r2Key,
        width: null,
        height: null,
        metadata: {
          action: job.action,
          modelId: job.modelId,
          sourceContentType: asset.contentType,
          hasBrushMask: Boolean(job.brushMaskKey),
        },
        contentType: uploaded.contentType,
        size: uploaded.size,
      }],
    }
  }

  if (EXTERNAL_PROVIDER_ACTIONS.has(job.action)) {
    throw new Error(`${job.action} requires configured provider runtime: ${job.modelId}`)
  }

  throw new Error(`provider execution not configured for ${job.action} (${job.modelId})`)
}
