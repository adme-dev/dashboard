import {
  compositeErase,
  coverageFromMask,
  coverageShare,
  featherCoverage,
  featherRadiusFor,
  maskMatchesPicture,
  modelFrameSize,
  paintHighlight,
  resizeCoverage,
  resizeImage,
  ringToneCorrection,
} from './eraseComposite'
import { decodePicture, encodeJpeg, encodePng, sniffPictureFormat } from './imageCodec'

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
  /**
   * The still picture an image tool works on. For a picture asset that is the asset
   * itself; for a video it is the asset's preview frame, and `source` says so.
   */
  fetchAssetPicture(sourceAssetId: string): Promise<{ bytes: Uint8Array; source: 'picture' | 'video-frame' }>
  /** Raw bytes of a stored object, e.g. the painted mask. */
  fetchObjectBytes(key: string): Promise<Uint8Array>
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
// An image-editing model: it takes reference pictures. (flux-1-schnell, used here
// before, is text-to-image only and rejects picture and mask inputs.)
const WORKERS_AI_IMAGE_CF_MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
const ERASE_INSTRUCTION = 'Remove everything covered by the translucent bright green highlight and fill that area with the natural background that would be behind it. Keep the rest of the image exactly as it is. The result must contain no green highlight.'

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

/** Workers AI image models return bare base64 (no data: prefix); the format is read from the bytes. */
function imageFromBareBase64(text: string): { bytes: Uint8Array; contentType: string } | null {
  const compact = text.trim()
  if (compact.length < 64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null
  const bytes = decodeBase64(compact)
  const format = sniffPictureFormat(bytes)
  return format ? { bytes, contentType: format === 'png' ? 'image/png' : 'image/jpeg' } : null
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractGeneratedImage(value: unknown): { bytes: Uint8Array; contentType: string } {
  const direct = firstString(value)
  if (direct) {
    const directImage = imageFromDataUri(direct) ?? imageFromBareBase64(direct)
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
        const nestedImage = imageFromDataUri(text) ?? imageFromBareBase64(text)
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

/** Sends reference pictures and a prompt to the edit model and returns the picture it produces. */
async function runImageEditModel(
  deps: ProviderDeps,
  input: { prompt: string; picture: Uint8Array; width: number; height: number }
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const form = new FormData()
  form.append('prompt', input.prompt)
  form.append('input_image_0', new Blob([input.picture as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
  form.append('width', String(input.width))
  form.append('height', String(input.height))
  // The model takes multipart input; a throwaway Request does the encoding.
  const encoded = new Request('http://multipart.invalid', { method: 'POST', body: form })
  const { job } = deps
  const generated = await deps.env.AI!.run(
    WORKERS_AI_IMAGE_CF_MODEL,
    { multipart: { body: encoded.body, contentType: encoded.headers.get('content-type') } },
    { gateway: { metadata: { tenantId: job.tenantId, projectId: job.projectId, jobId: job.id, modelId: job.modelId } } }
  )
  return extractGeneratedImage(generated)
}

const VIDEO_FRAME_NOTE = 'Made from the video\'s preview frame. The video itself is unchanged.'

async function runEraseFill(deps: ProviderDeps): Promise<AssetIntelligenceProviderResult> {
  const { job } = deps
  if (!job.sourceAssetId) throw new Error('Erase needs a source asset.')
  if (!job.brushMaskKey) throw new Error('Erase needs a painted area. Paint over what to remove, then run it again.')

  const picture = await deps.fetchAssetPicture(job.sourceAssetId)
  const original = decodePicture(picture.bytes)
  const maskBytes = await deps.fetchObjectBytes(job.brushMaskKey)
  if (sniffPictureFormat(maskBytes) !== 'png') throw new Error('The painted mask could not be read.')
  const mask = decodePicture(maskBytes)
  if (!maskMatchesPicture(mask, original)) {
    throw new Error(`The painted mask (${mask.width} x ${mask.height}) does not match the shape of the picture (${original.width} x ${original.height}). Paint it again in Prepare.`)
  }
  const painted = coverageFromMask(mask)
  const share = coverageShare(painted)
  if (share === 0) throw new Error('Erase needs a painted area. Paint over what to remove, then run it again.')

  // The model works at about one megapixel; everything it needs is prepared at that size.
  const frame = modelFrameSize(original.width, original.height)
  const frameCoverage = resizeCoverage(painted, frame.width, frame.height)
  const reference = resizeImage(original, frame.width, frame.height)
  const highlighted = paintHighlight(reference, frameCoverage)
  const guidance = job.prompt?.trim()
  const generated = await runImageEditModel(deps, {
    prompt: guidance ? `${ERASE_INSTRUCTION} Guidance from the editor: ${guidance}` : ERASE_INSTRUCTION,
    picture: encodeJpeg(highlighted),
    width: frame.width,
    height: frame.height,
  })
  const modelOutput = decodePicture(generated.bytes)

  // Paste back only the painted region, soft-edged, onto the untouched full-size original.
  const blend = featherCoverage(frameCoverage, featherRadiusFor(frame.width, frame.height))
  const toneCorrection = ringToneCorrection(reference, modelOutput, frameCoverage, blend)
  const region = compositeErase(original, modelOutput, blend, toneCorrection)
  const key = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}/edited.png`
  const uploaded = await deps.uploadBinary(key, encodePng(original), 'image/png')
  return {
    derivatives: [{
      kind: 'edited-image',
      r2Key: uploaded.r2Key,
      width: original.width,
      height: original.height,
      metadata: {
        action: job.action,
        modelId: job.modelId,
        title: picture.source === 'video-frame' ? 'Erased still from video frame' : 'Erased picture',
        // Says plainly what was edited: a video is never erased, only a still taken from it.
        source: picture.source,
        ...(picture.source === 'video-frame' ? { note: VIDEO_FRAME_NOTE } : {}),
        hasBrushMask: true,
        paintedShare: Number(share.toFixed(4)),
        changedRegion: region,
        modelFrame: frame,
        toneCorrection: toneCorrection.map(value => Number(value.toFixed(1))),
      },
      contentType: uploaded.contentType,
      size: uploaded.size,
    }],
  }
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

  if (job.action === 'erase-fill') {
    requireWorkersAiImageJob(job, job.action)
    if (!deps.env.AI) throw new Error(`${job.action} jobs require env.AI`)
    return runEraseFill(deps)
  }

  if (job.action === 'image-edit' || job.action === 'thumbnail-generation') {
    requireWorkersAiImageJob(job, job.action)
    if (!deps.env.AI) throw new Error(`${job.action} jobs require env.AI`)
    if (!job.sourceAssetId) throw new Error(`${job.action} jobs require sourceAssetId`)
    const picture = await deps.fetchAssetPicture(job.sourceAssetId)
    const original = decodePicture(picture.bytes)
    const frame = modelFrameSize(original.width, original.height)
    const image = await runImageEditModel(deps, {
      prompt: job.prompt ?? '',
      picture: encodeJpeg(resizeImage(original, frame.width, frame.height)),
      width: frame.width,
      height: frame.height,
    })
    const extension = image.contentType === 'image/png' ? 'png' : 'jpg'
    const key = `video-asset-derivatives/${job.tenantId}/${job.projectId}/${job.id}/${job.action === 'thumbnail-generation' ? 'thumbnail' : 'edited'}.${extension}`
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
          source: picture.source,
          ...(picture.source === 'video-frame' ? { note: VIDEO_FRAME_NOTE } : {}),
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
