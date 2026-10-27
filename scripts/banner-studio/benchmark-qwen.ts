/** Local-only evidence runner. Default dry-run never uploads artwork or invokes a provider. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { decode as decodeJpeg } from 'jpeg-js'
import { decomposeImageLayers } from '../../server/utils/qwenLayerDecomposer'
import {
  inspectArtworkReference,
  validateArtworkPng
} from '../../server/utils/banner/artworkValidation'

const DEFAULT_INPUT
  = '/Users/paulgiurin/Documents/Projects/dashboard/output/eastern-subaru-mailout-20261026/codex-jpeg-concepts/concept-1-bold-retail-lifestyle-A4.jpg'
const OUTPUT_ROOT = resolve('output/banner-provider-benchmarks')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export function parseBenchmarkArgs(args: string[]) {
  const options = {
    run: false,
    input: DEFAULT_INPUT,
    output: OUTPUT_ROOT,
    numLayers: 4,
    steps: 50
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--run') {
      options.run = true
      continue
    }
    if (arg === '--dry-run') {
      options.run = false
      continue
    }
    if (!['--input', '--output', '--layers', '--steps'].includes(arg || ''))
      throw new Error(`Unknown option: ${arg}`)
    const value = args[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${arg}`)
    if (arg === '--input') options.input = resolve(value)
    if (arg === '--output') options.output = resolve(value)
    if (arg === '--layers') options.numLayers = Number(value)
    if (arg === '--steps') options.steps = Number(value)
  }
  if (
    !Number.isInteger(options.numLayers)
    || options.numLayers < 2
    || options.numLayers > 8
  )
    throw new Error('Layers must be 2–8')
  if (
    !Number.isInteger(options.steps)
    || options.steps < 1
    || options.steps > 50
  )
    throw new Error('Steps must be 1–50')
  const child = relative(OUTPUT_ROOT, options.output)
  if (
    child.startsWith('..')
    || resolve(options.output) === resolve(options.input)
  )
    throw new Error(
      'Output must stay under ignored output/banner-provider-benchmarks'
    )
  return options
}

export function composeBenchmarkLayers(layers: Buffer[]): Buffer {
  if (!layers.length || layers.length > 9)
    throw new Error('Invalid registered layer count')
  const decoded = layers.map((bytes) => {
    validateArtworkPng(bytes, false)
    return PNG.sync.read(bytes, { checkCRC: true })
  })
  const width = decoded[0]!.width,
    height = decoded[0]!.height
  if (decoded.some(layer => layer.width !== width || layer.height !== height))
    throw new Error('Registered layer dimensions differ')
  const composite = new PNG({ width, height })
  composite.data.fill(0)
  for (const layer of decoded)
    for (let i = 0; i < layer.data.length; i += 4) {
      const sourceAlpha = layer.data[i + 3]! / 255,
        destinationAlpha = composite.data[i + 3]! / 255
      const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)
      for (let channel = 0; channel < 3; channel++)
        composite.data[i + channel] = alpha
          ? Math.round(
              (layer.data[i + channel]! * sourceAlpha
                + composite.data[i + channel]!
                * destinationAlpha
                * (1 - sourceAlpha))
              / alpha
            )
          : 0
      composite.data[i + 3] = Math.round(alpha * 255)
    }
  return PNG.sync.write(composite)
}

async function main() {
  const options = parseBenchmarkArgs(process.argv.slice(2)),
    startedAt = new Date().toISOString(),
    started = Date.now()
  const file = await stat(options.input)
  if (!file.isFile() || file.size > 20 * 1024 * 1024)
    throw new Error('Input must be a local image file up to20 MB')
  const source = await readFile(options.input),
    mimeType = ['.jpg', '.jpeg'].includes(extname(options.input).toLowerCase())
      ? 'image/jpeg'
      : 'image/png'
  const dimensions = inspectArtworkReference(source, mimeType)
  const runDirectory = resolve(
    options.output,
    `${startedAt.replace(/[:.]/g, '-')}-${sha(source).slice(0, 12)}`
  )
  await mkdir(options.output, { recursive: true })
  await mkdir(runDirectory)
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    status: options.run ? 'running' : 'dry-run',
    startedAt,
    finishedAt: null,
    elapsedMs: null,
    source: {
      path: options.input,
      sha256: sha(source),
      bytes: source.length,
      width: dimensions.width,
      height: dimensions.height,
      mimeType
    },
    provider: 'huggingface_space',
    model: 'Qwen/Qwen-Image-Layered',
    endpoint: 'https://qwen-qwen-image-layered.hf.space',
    parameters: {
      numLayers: options.numLayers,
      steps: options.steps,
      guidanceScale: 4,
      seed: 0,
      randomizeSeed: true,
      cfgNorm: true,
      useEnglishPrompt: true,
      prompt: '',
      negativePrompt: ' '
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    providerRequestId: null,
    cost: null,
    layers: [],
    composite: null,
    error: null,
    comparators: {
      seedream: {
        status: 'not-run',
        reason: 'No configured account/runtime; no purchase or API invocation'
      },
      layerD: {
        status: 'not-run',
        reason: 'Local inference runtime and weights not installed'
      }
    },
    limitations: [
      'Raster RGBA layers only; no native editable text recovery claim.',
      'Returned-order source-over composite requires visual quality review.',
      'Provider does not expose measured cost, versioned weights or request ID through this adapter.',
      'Seed randomisation is enabled by the current Space adapter; parameters are recorded but pixel repeatability is not promised.'
    ]
  }
  const save = () =>
    writeFile(
      resolve(runDirectory, 'evidence.json'),
      JSON.stringify(evidence, null, 2)
    )
  await save()
  if (!options.run) {
    console.log(`Dry-run only: ${runDirectory}/evidence.json`)
    return
  }
  try {
    let upload = source
    if (mimeType === 'image/jpeg') {
      const decoded = decodeJpeg(source, {
        useTArray: true,
        formatAsRGBA: true,
        tolerantDecoding: false,
        maxResolutionInMP: 16.777216,
        maxMemoryUsageInMB: 512
      })
      const png = new PNG({ width: decoded.width, height: decoded.height })
      png.data = Buffer.from(decoded.data)
      upload = PNG.sync.write(png)
    }
    evidence.upload = {
      sha256: sha(upload),
      bytes: upload.length,
      mimeType: 'image/png',
      method:
        mimeType === 'image/png'
          ? 'original-bytes'
          : 'local-deterministic-jpeg-decode-png-encode'
    }
    await save()
    const result = await decomposeImageLayers(upload, {
      numLayers: options.numLayers,
      steps: options.steps,
      guidanceScale: 4,
      hfToken: process.env.HF_TOKEN
    })
    if (!result?.layers.length)
      throw new Error(
        'Qwen returned no valid complete layer result; inspect content-free adapter status output'
      )
    const records = []
    for (const layer of result.layers) {
      const fileName = `layer-${String(layer.index).padStart(2, '0')}.png`,
        frame = validateArtworkPng(layer.pngBuffer, false)
      if (frame.width !== layer.width || frame.height !== layer.height)
        throw new Error('Layer metadata disagrees with decoded PNG')
      await writeFile(resolve(runDirectory, fileName), layer.pngBuffer)
      records.push({
        index: layer.index,
        file: fileName,
        sha256: sha(layer.pngBuffer),
        bytes: layer.pngBuffer.length,
        width: frame.width,
        height: frame.height,
        hasTransparency: frame.hasTransparency
      })
    }
    evidence.layers = records
    const composite = composeBenchmarkLayers(
      result.layers.map(layer => layer.pngBuffer)
    )
    await writeFile(resolve(runDirectory, 'composite.png'), composite)
    evidence.composite = {
      file: 'composite.png',
      sha256: sha(composite),
      ...validateArtworkPng(composite, false),
      method: 'returned-order-source-over'
    }
    evidence.status = 'completed-review-required'
  } catch (error) {
    evidence.status = 'failed'
    evidence.error = {
      code: 'QWEN_BENCHMARK_FAILED',
      message:
        error instanceof Error ? error.message : 'Unknown benchmark failure'
    }
    process.exitCode = 1
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.elapsedMs = Date.now() - started
    await save()
    console.log(`Evidence: ${runDirectory}/evidence.json`)
  }
}
if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void main().catch(() => {
    console.error(
      'Benchmark could not start; check local input, arguments and disk space.'
    )
    process.exitCode = 1
  })
