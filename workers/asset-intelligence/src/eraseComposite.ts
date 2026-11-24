// Pixel maths for "Erase and heal". Pure functions on RGBA buffers: no codecs, no I/O.
//
// The edit model redraws the whole picture at about one megapixel. To keep the
// original untouched and at full resolution, we take only the painted region
// (with a soft edge) from the model's output and paste it onto the original.

export interface RgbaImage {
  width: number
  height: number
  // RGBA, 4 bytes per pixel, row-major.
  data: Uint8Array
}

export interface CoverageMap {
  width: number
  height: number
  // 0..1 per pixel: how strongly the edit applies there.
  data: Float32Array
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

const MODEL_MAX_PIXELS = 1_000_000
const MODEL_DIMENSION_STEP = 16
const MODEL_MIN_EDGE = 256
// A mask whose shape differs from the picture by more than this was painted on a different frame.
const MAX_ASPECT_DRIFT = 0.03
const HIGHLIGHT_RGB = [0, 255, 150] as const
const HIGHLIGHT_OPACITY = 0.6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Size to send to the model: same shape as the picture, at most ~1MP, and on the
 * model's 16px grid. The picture is never upscaled for the model.
 */
export function modelFrameSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(MODEL_MAX_PIXELS / (width * height)))
  const snap = (value: number) => Math.max(MODEL_MIN_EDGE, Math.round((value * scale) / MODEL_DIMENSION_STEP) * MODEL_DIMENSION_STEP)
  return { width: snap(width), height: snap(height) }
}

/** True when a mask of this size was painted on a picture of the same shape. */
export function maskMatchesPicture(mask: { width: number; height: number }, picture: { width: number; height: number }): boolean {
  const maskAspect = mask.width / mask.height
  const pictureAspect = picture.width / picture.height
  return Math.abs(maskAspect - pictureAspect) / pictureAspect <= MAX_ASPECT_DRIFT
}

/**
 * Reads the painted area out of a mask picture.
 * Brush masks are transparent with opaque strokes, so alpha is the signal. A fully
 * opaque mask is treated as the conventional white-on-black kind.
 */
export function coverageFromMask(mask: RgbaImage): CoverageMap {
  const pixels = mask.width * mask.height
  const data = new Float32Array(pixels)
  let hasTransparency = false
  for (let index = 0; index < pixels; index += 1) {
    if (mask.data[index * 4 + 3]! < 255) { hasTransparency = true; break }
  }
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4
    if (hasTransparency) {
      data[index] = mask.data[offset + 3]! / 255
    } else {
      const luminance = (mask.data[offset]! * 0.299 + mask.data[offset + 1]! * 0.587 + mask.data[offset + 2]! * 0.114) / 255
      data[index] = luminance >= 0.5 ? 1 : 0
    }
  }
  return { width: mask.width, height: mask.height, data }
}

/** Share of the picture that is painted, 0..1. */
export function coverageShare(coverage: CoverageMap): number {
  let painted = 0
  for (let index = 0; index < coverage.data.length; index += 1) if (coverage.data[index]! >= 0.5) painted += 1
  return coverage.data.length ? painted / coverage.data.length : 0
}

function sampleCoverage(coverage: CoverageMap, u: number, v: number): number {
  const x = clamp(u * coverage.width - 0.5, 0, coverage.width - 1)
  const y = clamp(v * coverage.height - 0.5, 0, coverage.height - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(coverage.width - 1, x0 + 1)
  const y1 = Math.min(coverage.height - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const top = coverage.data[y0 * coverage.width + x0]! * (1 - fx) + coverage.data[y0 * coverage.width + x1]! * fx
  const bottom = coverage.data[y1 * coverage.width + x0]! * (1 - fx) + coverage.data[y1 * coverage.width + x1]! * fx
  return top * (1 - fy) + bottom * fy
}

/** Resamples a coverage map to another size. Positions are matched by fraction of the frame. */
export function resizeCoverage(coverage: CoverageMap, width: number, height: number): CoverageMap {
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = sampleCoverage(coverage, (x + 0.5) / width, v)
    }
  }
  return { width, height, data }
}

function boxPass(source: Float32Array, width: number, height: number, radius: number, horizontal: boolean, mode: 'max' | 'mean'): Float32Array {
  const out = new Float32Array(source.length)
  const lineLength = horizontal ? width : height
  const lineCount = horizontal ? height : width
  for (let line = 0; line < lineCount; line += 1) {
    for (let position = 0; position < lineLength; position += 1) {
      const from = Math.max(0, position - radius)
      const to = Math.min(lineLength - 1, position + radius)
      let accumulator = 0
      for (let cursor = from; cursor <= to; cursor += 1) {
        const value = source[horizontal ? line * width + cursor : cursor * width + line]!
        accumulator = mode === 'max' ? Math.max(accumulator, value) : accumulator + value
      }
      out[horizontal ? line * width + position : position * width + line] = mode === 'max' ? accumulator : accumulator / (to - from + 1)
    }
  }
  return out
}

/**
 * Turns hard coverage into a soft-edged blend map: fully on across the painted
 * area, fading to exactly zero within `2 * radius` pixels outside it.
 */
export function featherCoverage(coverage: CoverageMap, radius: number): CoverageMap {
  const r = Math.max(1, Math.round(radius))
  const { width, height } = coverage
  // Grow first so the fade happens outside the painted area, not inside it.
  let data = boxPass(coverage.data, width, height, r, true, 'max')
  data = boxPass(data, width, height, r, false, 'max')
  data = boxPass(data, width, height, r, true, 'mean')
  data = boxPass(data, width, height, r, false, 'mean')
  for (let index = 0; index < data.length; index += 1) {
    // Painted pixels always take the model's result in full.
    if (coverage.data[index]! >= 0.5) data[index] = 1
    else if (data[index]! < 1 / 255) data[index] = 0
  }
  return { width, height, data }
}

/** Feather radius in blend-map pixels, scaled to the frame so the edge looks the same on any size. */
export function featherRadiusFor(width: number, height: number): number {
  return Math.max(2, Math.round(Math.max(width, height) * 0.008))
}

/** Smallest rectangle of `target` size space that contains every non-zero blend value. Null when nothing is painted. */
export function blendBounds(blend: CoverageMap, target: { width: number; height: number }): PixelRect | null {
  let minX = blend.width
  let minY = blend.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < blend.height; y += 1) {
    for (let x = 0; x < blend.width; x += 1) {
      if (blend.data[y * blend.width + x]! > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const scaleX = target.width / blend.width
  const scaleY = target.height / blend.height
  // One blend pixel of slack each side covers the interpolation between neighbours.
  const x = clamp(Math.floor((minX - 1) * scaleX), 0, target.width)
  const y = clamp(Math.floor((minY - 1) * scaleY), 0, target.height)
  const right = clamp(Math.ceil((maxX + 2) * scaleX), 0, target.width)
  const bottom = clamp(Math.ceil((maxY + 2) * scaleY), 0, target.height)
  return { x, y, width: right - x, height: bottom - y }
}

/** Copies a rectangle out of a picture. The rectangle is clamped to the picture. */
export function cropImage(image: RgbaImage, rect: PixelRect): RgbaImage {
  const x = clamp(Math.floor(rect.x), 0, image.width - 1)
  const y = clamp(Math.floor(rect.y), 0, image.height - 1)
  const width = clamp(Math.ceil(rect.width), 1, image.width - x)
  const height = clamp(Math.ceil(rect.height), 1, image.height - y)
  const data = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * image.width + x) * 4
    data.set(image.data.subarray(from, from + width * 4), row * width * 4)
  }
  return { width, height, data }
}

/** The painted area plus a margin of its own size times `margin`, as a rectangle of the coverage map. Null when nothing is painted. */
export function paintedBounds(coverage: CoverageMap, margin: number): PixelRect | null {
  let minX = coverage.width
  let minY = coverage.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < coverage.height; y += 1) {
    for (let x = 0; x < coverage.width; x += 1) {
      if (coverage.data[y * coverage.width + x]! < 0.5) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * margin)
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  return { x, y, width: Math.min(coverage.width, maxX + pad + 1) - x, height: Math.min(coverage.height, maxY + pad + 1) - y }
}

/** Bilinear resize of an RGBA picture. */
export function resizeImage(image: RgbaImage, width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sy = clamp(((y + 0.5) / height) * image.height - 0.5, 0, image.height - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(image.height - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x += 1) {
      const sx = clamp(((x + 0.5) / width) * image.width - 0.5, 0, image.width - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(image.width - 1, x0 + 1)
      const fx = sx - x0
      const out = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        const top = image.data[(y0 * image.width + x0) * 4 + channel]! * (1 - fx) + image.data[(y0 * image.width + x1) * 4 + channel]! * fx
        const bottom = image.data[(y1 * image.width + x0) * 4 + channel]! * (1 - fx) + image.data[(y1 * image.width + x1) * 4 + channel]! * fx
        data[out + channel] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }
  return { width, height, data }
}

/**
 * The picture the model sees: the painted area tinted bright green, so
 * "remove what is under the green highlight" has something to point at.
 * `coverage` must be the same size as `image`.
 */
export function paintHighlight(image: RgbaImage, coverage: CoverageMap): RgbaImage {
  if (coverage.width !== image.width || coverage.height !== image.height) {
    throw new Error('highlight coverage must match the picture size')
  }
  const data = new Uint8Array(image.data)
  for (let index = 0; index < coverage.data.length; index += 1) {
    const amount = coverage.data[index]! >= 0.5 ? HIGHLIGHT_OPACITY : 0
    if (!amount) continue
    const offset = index * 4
    for (let channel = 0; channel < 3; channel += 1) {
      data[offset + channel] = Math.round(data[offset + channel]! * (1 - amount) + HIGHLIGHT_RGB[channel]! * amount)
    }
    data[offset + 3] = 255
  }
  return { width: image.width, height: image.height, data }
}

/**
 * The model redraws the whole picture and its overall tone drifts a little from
 * the original, which would show as a patch. This measures that drift on the ring
 * just outside the painted area, where both pictures show the same thing, and
 * returns the per-channel correction to add to the model's pixels.
 * `reference` is the original at the same size as `painted` and `blend`.
 */
export function ringToneCorrection(reference: RgbaImage, modelOutput: RgbaImage, painted: CoverageMap, blend: CoverageMap): [number, number, number] {
  const model = modelOutput.width === reference.width && modelOutput.height === reference.height
    ? modelOutput
    : resizeImage(modelOutput, reference.width, reference.height)
  const sums = [0, 0, 0]
  let count = 0
  for (let index = 0; index < blend.data.length; index += 1) {
    if (blend.data[index]! <= 0 || painted.data[index]! >= 0.5) continue
    const offset = index * 4
    for (let channel = 0; channel < 3; channel += 1) sums[channel]! += reference.data[offset + channel]! - model.data[offset + channel]!
    count += 1
  }
  if (!count) return [0, 0, 0]
  // A large shift means the ring is not the same content; correcting by it would do harm.
  const limit = 40
  return [0, 1, 2].map(channel => clamp(sums[channel]! / count, -limit, limit)) as [number, number, number]
}

/**
 * Pastes the model's result onto the original, only where `blend` is non-zero.
 * The original is modified in place and keeps its size; pixels where the blend
 * is zero are not written at all. The model output and blend map may be any
 * size: both are matched to the original by fraction of the frame.
 * `toneCorrection` is added to the model's pixels (see ringToneCorrection).
 */
export function compositeErase(original: RgbaImage, modelOutput: RgbaImage, blend: CoverageMap, toneCorrection: readonly [number, number, number] = [0, 0, 0]): PixelRect | null {
  const region = blendBounds(blend, original)
  if (!region) return null
  for (let y = region.y; y < region.y + region.height; y += 1) {
    const v = (y + 0.5) / original.height
    const my = clamp(v * modelOutput.height - 0.5, 0, modelOutput.height - 1)
    const my0 = Math.floor(my)
    const my1 = Math.min(modelOutput.height - 1, my0 + 1)
    const mfy = my - my0
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const u = (x + 0.5) / original.width
      const amount = sampleCoverage(blend, u, v)
      if (amount <= 0) continue
      const mx = clamp(u * modelOutput.width - 0.5, 0, modelOutput.width - 1)
      const mx0 = Math.floor(mx)
      const mx1 = Math.min(modelOutput.width - 1, mx0 + 1)
      const mfx = mx - mx0
      const out = (y * original.width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const top = modelOutput.data[(my0 * modelOutput.width + mx0) * 4 + channel]! * (1 - mfx) + modelOutput.data[(my0 * modelOutput.width + mx1) * 4 + channel]! * mfx
        const bottom = modelOutput.data[(my1 * modelOutput.width + mx0) * 4 + channel]! * (1 - mfx) + modelOutput.data[(my1 * modelOutput.width + mx1) * 4 + channel]! * mfx
        const generated = clamp(top * (1 - mfy) + bottom * mfy + toneCorrection[channel]!, 0, 255)
        original.data[out + channel] = Math.round(original.data[out + channel]! * (1 - amount) + generated * amount)
      }
    }
  }
  return region
}
