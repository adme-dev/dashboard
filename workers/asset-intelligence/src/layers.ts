// Separate layers, Lift and Remove background: the three jobs that cut a picture
// into RGBA pieces. All three go through the shared helper, which calls Seedream 5.5
// (and a vision model for Separate layers) through Cloudflare AI Gateway.
import {
  DEFAULT_MAX_COST_USD,
  LAYER_VISION_MODEL,
  SEEDREAM_LAYER_MODEL,
  decomposeImageToLayers,
  resolveMaxLayers,
  type DecomposeResult,
  type DecomposeUsage,
  type LayerBox
} from '../../../server/utils/image-layers/decompose'
import { paintedFrameKeyForMask } from '../../../shared/video/assetIntelligenceMaskFrame'
import { blendBounds, coverageFromMask, coverageShare, maskMatchesPicture } from './eraseComposite'
import { decodePicture, readPictureSize, sniffPictureFormat } from './imageCodec'
import { workerLayerCodec } from './layerCodec'
import type { AssetDerivativeOutput, AssetIntelligenceProviderResult, ProviderDeps } from './providers'

export const LAYER_PROVIDER = 'aigateway'
export const LAYER_MODEL_ID = 'aigateway/seedream-5.5'
export const LAYER_ACTIONS = new Set(['layer-decomposition', 'mask-lift', 'background-removal'])

const VIDEO_FRAME_NOTE = 'Made from a still frame of the video. The video itself is unchanged.'

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** What gets written to the invocation ledger and the layer manifest for one job. */
export function usageSummary(usage: DecomposeUsage) {
  return {
    costUsd: usage.costUsd,
    costBasis: 'published prices',
    latencyMs: usage.latencyMs,
    modelCalls: usage.calls.length,
    failedModelCalls: usage.calls.filter(call => !call.ok).length,
    models: [...new Set(usage.calls.map(call => call.model))],
    calls: usage.calls.map(call => ({ step: call.step, element: call.element ?? null, ms: call.ms, costUsd: call.costUsd, ok: call.ok }))
  }
}

function slug(value: string, fallback: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return cleaned || fallback
}

function requireLayerJob(deps: ProviderDeps) {
  const { job } = deps
  if (job.provider !== LAYER_PROVIDER || job.modelId !== LAYER_MODEL_ID) {
    throw new Error(`${job.action} model not supported: ${job.modelId}`)
  }
  if (!job.sourceAssetId) throw new Error(`${job.action} needs a source asset.`)
  if (!deps.env.AI) throw new Error(`${job.action} jobs require env.AI`)
}

async function decompose(
  deps: ProviderDeps,
  picture: Uint8Array,
  opts: Parameters<typeof decomposeImageToLayers>[1]
): Promise<DecomposeResult> {
  const { job, env } = deps
  return decomposeImageToLayers(picture, {
    ...opts,
    guidance: job.prompt,
    maxCostUsd: positiveNumber(env.ASSET_INTELLIGENCE_MAX_JOB_COST_USD) ?? DEFAULT_MAX_COST_USD,
    metadata: { tenantId: job.tenantId, projectId: job.projectId, jobId: job.id, modelId: job.modelId }
  }, {
    run: (model, inputs, options) => env.AI!.run(model, inputs, options),
    codec: workerLayerCodec
  })
}

async function storeLayers(
  deps: ProviderDeps,
  result: DecomposeResult,
  source: 'picture' | 'video-frame',
  singleTitle?: string
): Promise<AssetDerivativeOutput[]> {
  const { job } = deps
  const prefix = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}`
  const shared = {
    action: job.action,
    modelId: job.modelId,
    source,
    ...(source === 'video-frame' ? { note: VIDEO_FRAME_NOTE } : {}),
    sourceWidth: result.width,
    sourceHeight: result.height
  }
  const derivatives: AssetDerivativeOutput[] = []
  for (const layer of result.layers) {
    const key = `${prefix}/layer-${String(layer.z).padStart(2, '0')}-${slug(layer.name, 'layer')}.png`
    const uploaded = await deps.uploadBinary(key, layer.png, 'image/png')
    derivatives.push({
      kind: 'foreground-png',
      r2Key: uploaded.r2Key,
      width: layer.width,
      height: layer.height,
      metadata: {
        ...shared,
        title: singleTitle ?? layer.name,
        layerName: layer.name,
        layerKind: layer.kind,
        // Where the layer sits in the source picture, in source pixels.
        bbox: layer.bbox,
        z: layer.z
      },
      contentType: uploaded.contentType,
      size: uploaded.size
    })
  }
  return derivatives
}

export async function runLayerDecomposition(deps: ProviderDeps): Promise<AssetIntelligenceProviderResult> {
  requireLayerJob(deps)
  const { job, env } = deps
  const picture = await deps.fetchAssetPicture(job.sourceAssetId!)
  const result = await decompose(deps, picture.bytes, {
    maxLayers: resolveMaxLayers(positiveNumber(env.ASSET_INTELLIGENCE_MAX_LAYERS)),
    includeBase: true
  })
  const derivatives = await storeLayers(deps, result, picture.source)
  const prefix = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}`
  const shared = {
    action: job.action,
    modelId: job.modelId,
    source: picture.source,
    ...(picture.source === 'video-frame' ? { note: VIDEO_FRAME_NOTE } : {})
  }
  let baseKey: string | null = null
  if (result.base) {
    const uploaded = await deps.uploadBinary(`${prefix}/base.png`, result.base.png, 'image/png')
    baseKey = uploaded.r2Key
    derivatives.push({
      kind: 'background-png',
      r2Key: uploaded.r2Key,
      width: result.base.width,
      height: result.base.height,
      metadata: { ...shared, title: 'Base without the separated elements', z: 0 },
      contentType: uploaded.contentType,
      size: uploaded.size
    })
  }
  // The manifest is what an editor needs to rebuild the picture: base first, then layers back to front.
  const manifest = await deps.uploadJson(`${prefix}/layers.json`, {
    jobId: job.id,
    sourceAssetId: job.sourceAssetId,
    source: picture.source,
    width: result.width,
    height: result.height,
    base: baseKey ? { r2Key: baseKey, width: result.base!.width, height: result.base!.height } : null,
    layers: result.layers.map((layer, index) => ({
      r2Key: derivatives[index]!.r2Key,
      name: layer.name,
      kind: layer.kind,
      z: layer.z,
      bbox: layer.bbox,
      width: layer.width,
      height: layer.height
    })),
    skipped: result.skipped,
    usage: usageSummary(result.usage)
  })
  derivatives.push({
    kind: 'layer-package',
    r2Key: manifest.r2Key,
    width: result.width,
    height: result.height,
    metadata: {
      ...shared,
      title: `${result.layers.length} layer${result.layers.length === 1 ? '' : 's'}${result.base ? ' and a base' : ''}`,
      layerCount: result.layers.length,
      hasBase: Boolean(result.base),
      // Says plainly when some elements or the base did not come back.
      partial: result.skipped.length > 0,
      skipped: result.skipped
    },
    contentType: manifest.contentType,
    size: manifest.size
  })
  return { derivatives, usage: { ...usageSummary(result.usage), layerCount: result.layers.length, skipped: result.skipped.length } }
}

/** The painted area as a box on the picture. Null when nothing is painted. */
export function paintedBox(maskBytes: Uint8Array, picture: { width: number, height: number }): LayerBox | null {
  if (sniffPictureFormat(maskBytes) !== 'png') throw new Error('The painted mask could not be read.')
  const mask = decodePicture(maskBytes)
  if (!maskMatchesPicture(mask, picture)) {
    throw new Error(`The painted mask (${mask.width} x ${mask.height}) does not match the shape of the picture (${picture.width} x ${picture.height}). Paint it again in Prepare.`)
  }
  const painted = coverageFromMask(mask)
  if (coverageShare(painted) === 0) return null
  return blendBounds(painted, picture)
}

export async function runMaskLift(deps: ProviderDeps): Promise<AssetIntelligenceProviderResult> {
  requireLayerJob(deps)
  const { job } = deps
  if (!job.brushMaskKey) throw new Error('Lift needs a painted area. Paint over what to lift, then run it again.')
  // For a video, the mask was painted on a captured frame stored beside it; lift from that frame.
  const picture = await deps.fetchAssetPicture(job.sourceAssetId!, paintedFrameKeyForMask(job.brushMaskKey))
  const size = readPictureSize(picture.bytes)
  if (!size) throw new Error('The picture could not be read.')
  const box = paintedBox(await deps.fetchObjectBytes(job.brushMaskKey), size)
  if (!box) throw new Error('Lift needs a painted area. Paint over what to lift, then run it again.')
  const result = await decompose(deps, picture.bytes, {
    elements: [{ name: job.prompt?.trim() ? 'highlighted element' : 'element inside the highlighted area', box, kind: 'lift' }],
    includeBase: false
  })
  const derivatives = await storeLayers(deps, result, picture.source, picture.source === 'video-frame' ? 'Lifted cut-out from video frame' : 'Lifted cut-out')
  derivatives[0]!.metadata.hasBrushMask = true
  derivatives[0]!.metadata.paintedBox = box
  return { derivatives, usage: usageSummary(result.usage) }
}

export async function runBackgroundRemoval(deps: ProviderDeps): Promise<AssetIntelligenceProviderResult> {
  requireLayerJob(deps)
  const { job } = deps
  const picture = await deps.fetchAssetPicture(job.sourceAssetId!)
  const size = readPictureSize(picture.bytes)
  if (!size) throw new Error('The picture could not be read.')
  const result = await decompose(deps, picture.bytes, {
    elements: [{ name: 'main subject', box: { x: 0, y: 0, width: size.width, height: size.height }, kind: 'subject' }],
    includeBase: false
  })
  const derivatives = await storeLayers(deps, result, picture.source, picture.source === 'video-frame' ? 'Subject without background, from video frame' : 'Subject without background')
  return { derivatives, usage: usageSummary(result.usage) }
}

export const LAYER_RUNTIME_MODELS = { image: SEEDREAM_LAYER_MODEL, vision: LAYER_VISION_MODEL }
