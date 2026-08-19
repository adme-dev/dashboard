import { getCreativeGenerationModel } from './modelRegistry'
import type {
  CreativeGenerationResult,
  CreativeGenerationSubjectType,
} from './types'

export interface CreativeAiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
}

export interface GenerateCreativeImageInput {
  modelId: string
  subjectType: CreativeGenerationSubjectType
  prompt?: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  sourceUrl?: string | null
  targetMegapixels?: number
  outputFormat?: 'webp' | 'jpg' | 'png'
  outputQuality?: number
  enhanceDetails?: boolean
  enhanceRealism?: boolean
  metadata?: Record<string, string>
}

const RECRAFT_SIZE: Record<NonNullable<GenerateCreativeImageInput['aspectRatio']>, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1365x1024',
  '3:4': '1024x1365',
}

const VEHICLE_PROMPT_RE = /\b(vehicle|automobile|automotive|car|sedan|hatchback|wagon|coupe|convertible|ute|pickup|suv|4wd|truck|van|dealer|dealership|oem|badge|grille|wheel|tyre|toyota|lexus|mazda|ford|mitsubishi|haval|gwm|kia|hyundai|genesis|nissan|infiniti|isuzu|honda|subaru|suzuki|volkswagen|audi|bmw|mini|mercedes|volvo|polestar|tesla|byd|chery|jeep|ram|chevrolet|porsche|land\s*rover|range\s*rover)\b/i

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Math.round(value ?? fallback)))
}

export function buildCreativeGenerationInputs(input: GenerateCreativeImageInput): Record<string, unknown> {
  const model = getCreativeGenerationModel(input.modelId)
  if (!model) throw new Error('Unknown creative generation model')
  if (!model.allowedSubjectTypes.includes(input.subjectType)) {
    throw new Error(`${model.displayName} is not approved for ${input.subjectType} subjects`)
  }

  if (model.cfModel === 'recraft/recraftv4-1') {
    const prompt = String(input.prompt || '').trim()
    if (!prompt) throw new Error('A prompt is required for Recraft generation')
    if (VEHICLE_PROMPT_RE.test(prompt)) {
      throw new Error('Vehicle generation is blocked; use an approved-source transform or image-to-video model')
    }
    return {
      prompt: prompt.slice(0, 2000),
      size: RECRAFT_SIZE[input.aspectRatio ?? '1:1'],
    }
  }

  if (model.cfModel === 'pruna/p-image-upscale') {
    if (!input.sourceUrl) throw new Error('An approved source asset is required for upscaling')
    if (input.subjectType === 'vehicle' && (input.enhanceDetails || input.enhanceRealism)) {
      throw new Error('Vehicle upscaling cannot enable generative detail or realism enhancement')
    }
    return {
      image: input.sourceUrl,
      target: clampInteger(input.targetMegapixels, 1, 128, 4),
      output_format: input.outputFormat ?? 'webp',
      output_quality: clampInteger(input.outputQuality, 0, 100, 90),
      enhance_details: input.enhanceDetails ?? false,
      enhance_realism: input.enhanceRealism ?? false,
      disable_safety_checker: false,
    }
  }

  throw new Error('Creative model adapter is unavailable')
}

function extractImageUrl(raw: any): string | null {
  const result = raw?.result?.result ?? raw?.result ?? raw
  const value = result?.image ?? result?.url ?? result?.output_url ?? result?.outputUrl ?? null
  return typeof value === 'string' ? value : null
}

function assertProviderImageUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Provider returned an unsafe image URL')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || hostname === '::1') {
    throw new Error('Provider returned a private image URL')
  }
  return url
}

export async function generateCreativeImage(
  ai: CreativeAiBinding,
  input: GenerateCreativeImageInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CreativeGenerationResult> {
  const model = getCreativeGenerationModel(input.modelId)
  if (!model) throw new Error('Unknown creative generation model')
  const raw = await ai.run(model.cfModel, buildCreativeGenerationInputs(input), {
    gateway: { metadata: input.metadata ?? {} },
  })
  const outputUrl = extractImageUrl(raw)
  if (!outputUrl) throw new Error('Creative model returned no image URL')
  const response = await fetchImpl(assertProviderImageUrl(outputUrl))
  if (!response.ok) throw new Error(`Creative output download failed: ${response.status}`)
  const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/webp'
  if (!contentType.startsWith('image/')) throw new Error('Creative model returned a non-image output')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error('Creative model returned an empty image')
  return { buffer, contentType, modelId: model.id, cfModel: model.cfModel, safetyClass: model.safetyClass }
}
