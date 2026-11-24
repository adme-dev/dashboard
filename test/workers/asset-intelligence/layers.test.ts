import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAssetIntelligenceProvider, type ProviderDeps } from '~~/workers/asset-intelligence/src/providers'
import { paintedBox } from '~~/workers/asset-intelligence/src/layers'
import { decodePicture, encodeJpeg, encodePng } from '~~/workers/asset-intelligence/src/imageCodec'
import { processAssetIntelligenceJob } from '~~/workers/asset-intelligence/src/worker'
import type { RgbaImage } from '~~/workers/asset-intelligence/src/eraseComposite'
import { LAYER_VISION_MODEL, SEEDREAM_LAYER_MODEL } from '~~/server/utils/image-layers/decompose'

// 1280 x 720 is inside Seedream's size range, so the model frame equals the picture.
const W = 1280
const H = 720

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) data.set(rgba, index * 4)
  return { width, height, data }
}

function withRect(image: RgbaImage, rect: { x: number, y: number, w: number, h: number }, rgba: [number, number, number, number]): RgbaImage {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) image.data.set(rgba, (y * image.width + x) * 4)
  }
  return image
}

const cutOut = (rect: { x: number, y: number, w: number, h: number }) => encodePng(withRect(solid(W, H, [0, 0, 0, 0]), rect, [220, 30, 30, 255]))
const sourceJpeg = encodeJpeg(solid(W, H, [40, 60, 80, 255]))

const layerJob = {
  id: 'job-9',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  sourceAssetId: 'asset-1',
  modelId: 'aigateway/seedream-5.5',
  provider: 'aigateway',
  prompt: null,
  brushMaskKey: null
}

/** A fake gateway plus a fake download of each result URL. */
function setup(input: {
  elements?: unknown[]
  outputs: Array<{ match: string, bytes?: Uint8Array, error?: Error }>
  source?: 'picture' | 'video-frame'
  mask?: Uint8Array
  env?: Record<string, string>
}) {
  const downloads = new Map<string, Uint8Array>()
  const run = vi.fn(async (model: string, inputs: Record<string, any>) => {
    if (model === LAYER_VISION_MODEL) {
      return { choices: [{ message: { content: JSON.stringify({ elements: input.elements ?? [] }) } }], usage: { prompt_tokens: 1200, total_tokens: 1600 } }
    }
    const output = input.outputs.find(candidate => String(inputs.prompt).includes(candidate.match))
    if (!output) throw new Error(`no fake output for ${String(inputs.prompt).slice(0, 50)}`)
    if (output.error) throw output.error
    const url = `https://outputs.example/${downloads.size + 1}.png`
    downloads.set(url, output.bytes!)
    return { state: 'Completed', result: { images: [url] } }
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(downloads.get(url) as any, { status: downloads.has(url) ? 200 : 404 })))
  const stored = new Map<string, Uint8Array | unknown>()
  const deps: Omit<ProviderDeps, 'job'> = {
    env: { AI: { run }, ...(input.env ?? {}) } as any,
    fetchAssetBytes: vi.fn(),
    fetchAssetPicture: vi.fn().mockResolvedValue({ bytes: sourceJpeg, source: input.source ?? 'picture' }),
    fetchObjectBytes: vi.fn().mockResolvedValue(input.mask ?? new Uint8Array()),
    copyR2Object: vi.fn(),
    uploadJson: vi.fn(async (key: string, value: unknown) => { stored.set(key, value); return { r2Key: key, contentType: 'application/json', size: 10 } }),
    uploadBinary: vi.fn(async (key: string, bytes: any, contentType: string) => { stored.set(key, bytes); return { r2Key: key, contentType, size: bytes.byteLength } })
  }
  return { run, deps, stored }
}

afterEach(() => vi.unstubAllGlobals())

describe('Separate layers job', () => {
  const elements = [
    { name: 'headline', kind: 'text', box_2d: [100, 50, 300, 450], z: 2 },
    { name: 'red car', kind: 'product', box_2d: [400, 300, 900, 700], z: 1 }
  ]
  const outputs = [
    { match: 'Extract only the headline', bytes: cutOut({ x: 64, y: 72, w: 512, h: 144 }) },
    { match: 'Extract only the red car', bytes: cutOut({ x: 384, y: 288, w: 512, h: 360 }) },
    { match: 'Remove these elements', bytes: encodePng(solid(W, H, [40, 60, 80, 255])) }
  ]

  it('stores each layer, the base and a manifest as project assets', async () => {
    const { deps, stored, run } = setup({ elements, outputs })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps })

    expect(result.derivatives.map(derivative => [derivative.kind, derivative.r2Key])).toEqual([
      ['foreground-png', 'video-asset-derivatives/tenant-1/project-1/job-9/layer-01-red-car.png'],
      ['foreground-png', 'video-asset-derivatives/tenant-1/project-1/job-9/layer-02-headline.png'],
      ['background-png', 'video-asset-derivatives/tenant-1/project-1/job-9/base.png'],
      ['layer-package', 'video-asset-derivatives/tenant-1/project-1/job-9/layers.json']
    ])
    // Each layer carries where it sits in the source picture, its order and its name.
    expect(result.derivatives[0]).toMatchObject({
      width: 512,
      height: 360,
      metadata: { title: 'red car', layerName: 'red car', layerKind: 'product', z: 1, bbox: { x: 384, y: 288, width: 512, height: 360 }, sourceWidth: W, sourceHeight: H }
    })
    expect(result.derivatives[1]!.metadata).toMatchObject({ layerName: 'headline', z: 2, bbox: { x: 64, y: 72, width: 512, height: 144 } })
    expect(result.derivatives[3]!.metadata).toMatchObject({ title: '2 layers and a base', layerCount: 2, hasBase: true, partial: false })

    // The stored layer really is a cropped RGBA cut-out.
    const stray = decodePicture(stored.get('video-asset-derivatives/tenant-1/project-1/job-9/layer-01-red-car.png') as Uint8Array)
    expect(stray).toMatchObject({ width: 512, height: 360 })
    expect(stray.data[3]).toBe(255)

    const manifest = stored.get('video-asset-derivatives/tenant-1/project-1/job-9/layers.json') as any
    expect(manifest).toMatchObject({ width: W, height: H, base: { r2Key: 'video-asset-derivatives/tenant-1/project-1/job-9/base.png' }, skipped: [] })
    expect(manifest.layers.map((layer: any) => [layer.name, layer.z])).toEqual([['red car', 1], ['headline', 2]])

    // Vision once, Seedream once per element and once for the base, all tagged with the job.
    expect(run.mock.calls.map(call => call[0])).toEqual([LAYER_VISION_MODEL, SEEDREAM_LAYER_MODEL, SEEDREAM_LAYER_MODEL, SEEDREAM_LAYER_MODEL])
    expect(run.mock.calls[0]![2]).toEqual({ gateway: { id: 'default', metadata: { feature: 'image-layers', tenantId: 'tenant-1', projectId: 'project-1', jobId: 'job-9', modelId: 'aigateway/seedream-5.5' } } })
  })

  it('records what the job cost and how long it took', async () => {
    const { deps } = setup({ elements, outputs })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps })

    // Gemini: 1200 in + 400 out tokens = 0.0024; three Seedream calls at 0.028.
    expect(result.usage).toMatchObject({ costUsd: 0.0864, costBasis: 'published prices', modelCalls: 4, failedModelCalls: 0, layerCount: 2, skipped: 0 })
    expect(result.usage!.latencyMs).toEqual(expect.any(Number))
    expect(result.usage!.models).toEqual([LAYER_VISION_MODEL, SEEDREAM_LAYER_MODEL])
  })

  it('obeys the layer cap set on the worker', async () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ name: `part${index}`, box_2d: [100, 50, 300, 450], z: index + 1 }))
    const { deps, run } = setup({
      elements: many,
      outputs: [...many.map(part => ({ match: `Extract only the ${part.name}`, bytes: cutOut({ x: 64, y: 72, w: 512, h: 144 }) })), outputs[2]!],
      env: { ASSET_INTELLIGENCE_MAX_LAYERS: '2' }
    })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps })

    expect(result.derivatives.filter(derivative => derivative.kind === 'foreground-png')).toHaveLength(2)
    expect(String(run.mock.calls[0]![1].messages[0].content[0].text)).toContain('Return at most 2 elements')
  })

  it('refuses the job before any model call when it would exceed the worker\'s cost limit', async () => {
    const { deps, run } = setup({ elements, outputs, env: { ASSET_INTELLIGENCE_MAX_JOB_COST_USD: '0.02' } })
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps }))
      .rejects.toMatchObject({ code: 'budget_exceeded', message: 'This job would cost more than the limit of US$0.02 for one run.' })
    expect(run).not.toHaveBeenCalled()
  })

  it('marks the result partial and says what is missing when an element or the base fails', async () => {
    const { deps } = setup({
      elements,
      outputs: [outputs[0]!, { match: 'Extract only the red car', error: new Error('7003: User Input Error') }, { match: 'Remove these elements', error: new Error('upstream timeout') }]
    })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps })

    expect(result.derivatives.map(derivative => derivative.kind)).toEqual(['foreground-png', 'layer-package'])
    expect(result.derivatives[1]!.metadata).toMatchObject({
      title: '1 layer',
      hasBase: false,
      partial: true,
      skipped: [
        { name: 'red car', step: 'extract', reason: 'the image service rejected the request' },
        { name: 'Base picture', step: 'base', reason: 'upstream timeout' }
      ]
    })
  })

  it('says a still came from a video frame', async () => {
    const { deps } = setup({ elements, outputs, source: 'video-frame' })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'layer-decomposition' }, ...deps })
    expect(result.derivatives[0]!.metadata).toMatchObject({ source: 'video-frame', note: 'Made from a still frame of the video. The video itself is unchanged.' })
  })
})

describe('Lift job', () => {
  // A brush mask at half the picture's size, painted over the area x 100-350, y 500-640 of the picture.
  const mask = encodePng(withRect(solid(W / 2, H / 2, [0, 0, 0, 0]), { x: 50, y: 250, w: 125, h: 70 }, [255, 255, 255, 255]))

  it('turns the painted area into a box on the picture', () => {
    expect(paintedBox(mask, { width: W, height: H })).toEqual({ x: 98, y: 498, width: 254, height: 144 })
    expect(paintedBox(encodePng(solid(W / 2, H / 2, [0, 0, 0, 0])), { width: W, height: H })).toBeNull()
    expect(() => paintedBox(encodePng(solid(300, 300, [0, 0, 0, 0])), { width: W, height: H })).toThrow('does not match the shape of the picture')
    expect(() => paintedBox(new Uint8Array([1, 2, 3]), { width: W, height: H })).toThrow('The painted mask could not be read.')
  })

  it('lifts what is under the highlight as one RGBA cut-out, with one model call and no vision pass', async () => {
    const { deps, run } = setup({ mask, outputs: [{ match: 'Extract only the element inside the highlighted area', bytes: cutOut({ x: 104, y: 504, w: 240, h: 130 }) }] })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'mask-lift', brushMaskKey: 'masks/m.png' }, ...deps })

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]![0]).toBe(SEEDREAM_LAYER_MODEL)
    expect(run.mock.calls[0]![1]).toMatchObject({ background: 'transparent', output_format: 'png', size: '1280x720', watermark: false })
    // The painted box, on Seedream's 0-999 scale.
    expect(String(run.mock.calls[0]![1].prompt)).toContain('<bbox>76 691 275 891</bbox>')
    expect(result.derivatives).toHaveLength(1)
    expect(result.derivatives[0]).toMatchObject({
      kind: 'foreground-png',
      r2Key: 'video-asset-derivatives/tenant-1/project-1/job-9/layer-01-element-inside-the-highlighted-area.png',
      width: 240,
      height: 130,
      metadata: { title: 'Lifted cut-out', hasBrushMask: true, bbox: { x: 104, y: 504, width: 240, height: 130 }, paintedBox: { x: 98, y: 498, width: 254, height: 144 } }
    })
    expect(result.usage).toMatchObject({ costUsd: 0.028, modelCalls: 1 })
  })

  it('adds the editor\'s wording to the request', async () => {
    const { deps, run } = setup({ mask, outputs: [{ match: 'Extract only the highlighted element', bytes: cutOut({ x: 104, y: 504, w: 240, h: 130 }) }] })
    await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'mask-lift', brushMaskKey: 'masks/m.png', prompt: 'just the yellow price badge' }, ...deps })
    expect(String(run.mock.calls[0]![1].prompt)).toContain('The editor asked for: just the yellow price badge')
  })

  it.each([
    ['no mask was painted', { brushMaskKey: null }, undefined, 'Lift needs a painted area. Paint over what to lift, then run it again.'],
    ['the mask is empty', { brushMaskKey: 'masks/m.png' }, encodePng(solid(W / 2, H / 2, [0, 0, 0, 0])), 'Lift needs a painted area. Paint over what to lift, then run it again.']
  ])('fails clearly when %s, without calling the model', async (_label, jobFields, maskBytes, message) => {
    const { deps, run } = setup({ mask: maskBytes, outputs: [] })
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action: 'mask-lift', ...jobFields }, ...deps })).rejects.toThrow(message)
    expect(run).not.toHaveBeenCalled()
  })

  it('fails clearly when the model returns nothing for the highlighted area', async () => {
    const { deps } = setup({ mask, outputs: [{ match: 'Extract only', bytes: encodePng(solid(W, H, [0, 0, 0, 0])) }] })
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action: 'mask-lift', brushMaskKey: 'masks/m.png' }, ...deps }))
      .rejects.toMatchObject({ code: 'extraction_failed', message: 'None of the 1 element could be cut out: the model returned nothing for this element.' })
  })
})

describe('Remove background job', () => {
  it('keeps the subject on a transparent background with one model call', async () => {
    const { deps, run } = setup({ outputs: [{ match: 'Remove the background from this image and keep only the main subject', bytes: cutOut({ x: 300, y: 200, w: 600, h: 400 }) }] })
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'background-removal' }, ...deps })

    expect(run).toHaveBeenCalledTimes(1)
    expect(result.derivatives).toHaveLength(1)
    expect(result.derivatives[0]).toMatchObject({
      kind: 'foreground-png',
      width: 600,
      height: 400,
      metadata: { title: 'Subject without background', bbox: { x: 300, y: 200, width: 600, height: 400 } }
    })
  })

  it('fails clearly when the model hands the whole picture back', async () => {
    const { deps } = setup({ outputs: [{ match: 'Remove the background', bytes: encodePng(solid(W, H, [10, 20, 30, 255])) }] })
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action: 'background-removal' }, ...deps }))
      .rejects.toThrow('the model returned the whole picture instead of a cut-out')
  })
})

describe('layer jobs refuse the wrong provider or a missing binding', () => {
  it.each(['layer-decomposition', 'mask-lift', 'background-removal'])('%s', async (action) => {
    const { deps, run } = setup({ outputs: [] })
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action, provider: 'workers-ai', modelId: 'workers-ai/flux-edit' }, ...deps }))
      .rejects.toThrow(`${action} model not supported: workers-ai/flux-edit`)
    await expect(runAssetIntelligenceProvider({ job: { ...layerJob, action }, ...deps, env: {} as any }))
      .rejects.toThrow(`${action} jobs require env.AI`)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('job status for layer jobs', () => {
  const message = { jobId: '11111111-1111-4111-8111-111111111111', projectId: 'project-1', sourceAssetId: 'asset-1' }
  const queued = { ...layerJob, id: message.jobId, action: 'layer-decomposition', status: 'queued' }
  const baseDeps = () => ({
    getJob: vi.fn().mockResolvedValue(queued),
    markRunning: vi.fn().mockResolvedValue({ id: queued.id, status: 'running' }),
    markFailed: vi.fn().mockResolvedValue({ id: queued.id, status: 'failed' }),
    markSucceeded: vi.fn().mockResolvedValue({ id: queued.id, status: 'succeeded' }),
    createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-1' }),
    recordInvocation: vi.fn().mockResolvedValue(undefined)
  })

  it('marks the job succeeded and writes cost and latency to the invocation ledger', async () => {
    const deps = baseDeps()
    const usage = { costUsd: 0.1988, latencyMs: 61000, modelCalls: 8, layerCount: 6 }
    const result = await processAssetIntelligenceJob(message, {
      ...deps,
      runProvider: vi.fn().mockResolvedValue({ derivatives: [{ kind: 'foreground-png', r2Key: 'k.png', width: 10, height: 10, metadata: {} }], usage })
    })

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: queued.id, outputDerivativeIds: ['derivative-1'] })
    expect(deps.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'aigateway',
      modelId: 'aigateway/seedream-5.5',
      gatewayUsed: true,
      status: 'success',
      metadata: expect.objectContaining({ outcome: 'succeeded', action: 'layer-decomposition', usage })
    }))
  })

  it('marks the job failed with the readable reason, and still records what was spent', async () => {
    const deps = baseDeps()
    const error = Object.assign(new Error('No separate elements were found in this picture. Try Lift and paint over the part you want.'), {
      code: 'no_elements',
      usage: { costUsd: 0.0024, latencyMs: 7000, calls: [{ step: 'vision' }] }
    })
    const result = await processAssetIntelligenceJob(message, { ...deps, runProvider: vi.fn().mockRejectedValue(error) })

    expect(result).toEqual({ skipped: false, status: 'failed' })
    // Never left queued, running or blocked.
    expect(deps.markFailed).toHaveBeenCalledWith(queued.id, 'No separate elements were found in this picture. Try Lift and paint over the part you want.')
    expect(deps.markSucceeded).not.toHaveBeenCalled()
    expect(deps.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      metadata: expect.objectContaining({ outcome: 'failed', failureCode: 'no_elements', usage: { costUsd: 0.0024, latencyMs: 7000, modelCalls: 1 } })
    }))
  })
})

describe('Lift on a video', () => {
  it('lifts from the frame the mask was painted on, not the preview frame', async () => {
    const mask = encodePng(withRect(solid(W / 2, H / 2, [0, 0, 0, 0]), { x: 50, y: 250, w: 125, h: 70 }, [255, 255, 255, 255]))
    const { deps } = setup({ mask, source: 'video-frame', outputs: [{ match: 'Extract only', bytes: cutOut({ x: 104, y: 504, w: 240, h: 130 }) }] })
    const maskKey = 'video-asset-masks/project-1/asset-1/m1.png'
    const result = await runAssetIntelligenceProvider({ job: { ...layerJob, action: 'mask-lift', brushMaskKey: maskKey }, ...deps })

    expect(deps.fetchAssetPicture).toHaveBeenCalledWith('asset-1', 'video-asset-masks/project-1/asset-1/m1.frame.jpg')
    expect(result.derivatives[0]!.metadata).toMatchObject({ title: 'Lifted cut-out from video frame', source: 'video-frame' })
  })
})
