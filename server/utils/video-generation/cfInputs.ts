/**
 * Per-model input mapping for Cloudflare AI Gateway partner video models.
 *
 * Every partner model declares `additionalProperties: false` with its OWN field
 * names and allowed values (schemas pulled from
 * developers.cloudflare.com/ai/models/<vendor>/<model>/schema-input.json on
 * 2026-06-10), so a generic { prompt, image, duration, aspect_ratio } payload is
 * rejected with `7003: User Input Error` by most of them. Each mapper below emits
 * exactly the fields its schema accepts, coercing duration/resolution onto the
 * model's allowed values.
 */

export interface CfVideoInputRequest {
  prompt: string
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  /** Resolved source image (presigned URL, or data URI for base64-only models); null for t2v. */
  image: string | null
}

/** pixverse/veo accept only base64 data URIs for the image input; everyone else takes URLs. */
export function imageInputEncoding(cfModel: string): 'url' | 'base64' {
  if (cfModel.startsWith('pixverse/') || cfModel.startsWith('google/veo')) return 'base64'
  return 'url'
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Snap to the nearest value in an allowed set (ties go to the larger value —
 *  better to deliver slightly more footage than to cut the requested motion short). */
function nearestOf(value: number, allowed: number[]): number {
  return allowed.reduce((best, v) => (Math.abs(v - value) <= Math.abs(best - value) ? v : best), allowed[0]!)
}

/** Parse '720p' / '768P' / '1080p' → 720 / 768 / 1080; null/garbage → null. */
function resolutionNumber(resolution: string | null): number | null {
  const m = resolution?.match(/(\d{3,4})/)
  return m ? Number(m[1]) : null
}

function pickResolution(resolution: string | null, allowed: string[], fallback: string): string {
  const n = resolutionNumber(resolution)
  if (n === null) return fallback
  const match = allowed.find((a) => resolutionNumber(a) === n)
  return match ?? fallback
}

function pickEnum(value: string, allowed: string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback
}

/** Runway expresses output size as pixel ratios, not aspect strings. */
const RUNWAY_RATIO: Record<string, string> = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
  '4:3': '1104:832',
  '3:4': '832:1104',
  '21:9': '1584:672',
}

export function buildCfVideoInputs(cfModel: string, req: CfVideoInputRequest): Record<string, unknown> {
  // bytedance/seedance-2.0[-fast]: prompt, image?, duration 4–12, aspect_ratio, resolution 480p|720p
  if (cfModel.startsWith('bytedance/seedance')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt,
      duration: clampInt(req.durationSeconds, 4, 12),
      aspect_ratio: pickEnum(req.aspectRatio, ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21'], '16:9'),
      resolution: pickResolution(req.resolution, ['480p', '720p'], '720p'),
    }
    if (req.image) inputs.image = req.image
    return inputs
  }

  // alibaba/wan-2.7-i2v: image (required), prompt?, duration 2–15, resolution 720P|1080P — no aspect_ratio
  if (cfModel.startsWith('alibaba/wan')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt,
      duration: clampInt(req.durationSeconds, 2, 15),
      resolution: pickResolution(req.resolution, ['720P', '1080P'], '720P'),
    }
    if (req.image) inputs.image = req.image
    return inputs
  }

  // minimax/hailuo-2.3[-fast]: prompt?, first_frame_image?, duration 6|10, resolution 768P|1080P,
  // prompt_optimizer + fast_pretreatment required — no aspect_ratio
  if (cfModel.startsWith('minimax/hailuo')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt,
      prompt_optimizer: true,
      fast_pretreatment: false,
      duration: nearestOf(req.durationSeconds, [6, 10]),
      resolution: pickResolution(req.resolution, ['768P', '1080P'], '768P'),
    }
    if (req.image) inputs.first_frame_image = req.image
    return inputs
  }

  // runwayml/gen-4.5: prompt (≤1000), ratio (pixel enum), duration 2–10, image_input?
  if (cfModel.startsWith('runwayml/')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt.slice(0, 1000),
      ratio: RUNWAY_RATIO[req.aspectRatio] ?? '1280:720',
      duration: clampInt(req.durationSeconds, 2, 10),
    }
    if (req.image) inputs.image_input = req.image
    return inputs
  }

  // vidu/q3-*: duration 1–16 + resolution required; start_image for i2v; aspect_ratio is t2v-ONLY
  if (cfModel.startsWith('vidu/')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt,
      duration: clampInt(req.durationSeconds, 1, 16),
      resolution: pickResolution(req.resolution, ['540p', '720p', '1080p'], '720p'),
    }
    if (req.image) inputs.start_image = req.image
    else inputs.aspect_ratio = pickEnum(req.aspectRatio, ['16:9', '9:16', '3:4', '4:3', '1:1'], '16:9')
    return inputs
  }

  // pixverse/v5.6: prompt, duration 5|8|10, aspect_ratio, quality, generate_audio required;
  // image_input is base64-only (provider converts the URL before calling this)
  if (cfModel.startsWith('pixverse/')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt.slice(0, 2048),
      duration: nearestOf(req.durationSeconds, [5, 8, 10]),
      aspect_ratio: pickEnum(req.aspectRatio, ['16:9', '4:3', '1:1', '3:4', '9:16', '2:3', '3:2', '21:9'], '16:9'),
      quality: pickResolution(req.resolution, ['360p', '540p', '720p', '1080p'], '720p'),
      generate_audio: true,
    }
    if (req.image) inputs.image_input = req.image
    return inputs
  }

  // google/veo-3[.1][-fast]: prompt, duration '4s'|'6s'|'8s' (string!), aspect_ratio 16:9|9:16|1:1,
  // resolution, generate_audio required; image_input is base64-only
  if (cfModel.startsWith('google/veo')) {
    const inputs: Record<string, unknown> = {
      prompt: req.prompt,
      duration: `${nearestOf(req.durationSeconds, [4, 6, 8])}s`,
      aspect_ratio: pickEnum(req.aspectRatio, ['16:9', '9:16', '1:1'], '16:9'),
      resolution: pickResolution(req.resolution, ['720p', '1080p'], '720p'),
      generate_audio: true,
    }
    if (req.image) inputs.image_input = req.image
    return inputs
  }

  // Unknown family: legacy generic shape (better than throwing — surfaces the model's own error).
  const inputs: Record<string, unknown> = {
    prompt: req.prompt,
    duration: req.durationSeconds,
    aspect_ratio: req.aspectRatio,
  }
  if (req.resolution) inputs.resolution = req.resolution
  if (req.image) inputs.image = req.image
  return inputs
}
