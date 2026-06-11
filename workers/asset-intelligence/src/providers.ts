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

  throw new Error(`provider execution not configured for ${job.action} (${job.modelId})`)
}
