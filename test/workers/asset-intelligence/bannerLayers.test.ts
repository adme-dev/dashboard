import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAssetIntelligenceProvider, type ProviderDeps } from '~~/workers/asset-intelligence/src/providers'
import { encodeJpeg, encodePng } from '~~/workers/asset-intelligence/src/imageCodec'
import { processAssetIntelligenceJob } from '~~/workers/asset-intelligence/src/worker'
import type { RgbaImage } from '~~/workers/asset-intelligence/src/eraseComposite'
import { LAYER_VISION_MODEL } from '~~/server/utils/image-layers/decompose'
import { isBannerAssetDeliveryKey } from '~~/server/utils/bannerStorage'

const W = 1280
const H = 720
const USER = '11111111-1111-4111-8111-111111111111'
const BANNER_ASSET = '22222222-2222-4222-8222-222222222222'

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) data.set(rgba, index * 4)
  return { width, height, data }
}
function cutOut(rect: { x: number, y: number, w: number, h: number }, rgba: [number, number, number, number]) {
  const image = solid(W, H, [0, 0, 0, 0])
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) image.data.set(rgba, (y * W + x) * 4)
  }
  return encodePng(image)
}
const sourceJpeg = encodeJpeg(solid(W, H, [40, 60, 80, 255]))

const bannerJob = {
  id: 'job-banner',
  tenantId: 'client-7',
  projectId: 'banner-project-1',
  sourceAssetId: null,
  sourceBannerAssetId: BANNER_ASSET,
  createdBy: USER,
  action: 'layer-decomposition',
  modelId: 'aigateway/seedream-5.5',
  provider: 'aigateway',
  prompt: null,
  brushMaskKey: null
}

const elements = [
  { name: 'headline', kind: 'text', box_2d: [100, 50, 300, 450], z: 2 },
  { name: 'dealer logo', kind: 'logo', box_2d: [50, 800, 150, 950], z: 3 },
  { name: 'red car', kind: 'product', box_2d: [400, 300, 900, 700], z: 1 }
]

function setup(input: { textReply?: unknown, textError?: Error, bannerPicture?: boolean } = {}) {
  const downloads = new Map<string, Uint8Array>()
  const outputs = [
    { match: 'Extract only the headline', bytes: cutOut({ x: 64, y: 72, w: 512, h: 144 }, [250, 200, 0, 255]) },
    { match: 'Extract only the dealer logo', bytes: cutOut({ x: 1024, y: 36, w: 192, h: 72 }, [255, 255, 255, 255]) },
    { match: 'Extract only the red car', bytes: cutOut({ x: 384, y: 288, w: 512, h: 360 }, [220, 30, 30, 255]) },
    { match: 'Remove these elements', bytes: encodePng(solid(W, H, [40, 60, 80, 255])) }
  ]
  const run = vi.fn(async (model: string, inputs: Record<string, any>) => {
    if (model === LAYER_VISION_MODEL) {
      const prompt = String(inputs.messages[0].content[0].text)
      if (prompt.includes('lettering and nothing else')) {
        if (input.textError) throw input.textError
        return { choices: [{ message: { content: JSON.stringify(input.textReply ?? { elements: [] }) } }], usage: { prompt_tokens: 1000, total_tokens: 1200 } }
      }
      return { choices: [{ message: { content: JSON.stringify({ elements }) } }], usage: { prompt_tokens: 1200, total_tokens: 1600 } }
    }
    const output = outputs.find(candidate => String(inputs.prompt).includes(candidate.match))
    if (!output) throw new Error(`no fake output for ${String(inputs.prompt).slice(0, 50)}`)
    const url = `https://outputs.example/${downloads.size + 1}.png`
    downloads.set(url, output.bytes)
    return { state: 'Completed', result: { images: [url] } }
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(downloads.get(url) as any, { status: downloads.has(url) ? 200 : 404 })))
  const stored = new Map<string, any>()
  const fetchAssetPicture = vi.fn().mockRejectedValue(new Error('a banner job must not read a video asset'))
  const fetchBannerPicture = vi.fn().mockResolvedValue({ bytes: sourceJpeg, source: 'picture' })
  const deps: Omit<ProviderDeps, 'job'> = {
    env: { AI: { run } } as any,
    fetchAssetBytes: vi.fn(),
    fetchAssetPicture,
    ...(input.bannerPicture === false ? {} : { fetchBannerPicture }),
    fetchObjectBytes: vi.fn(),
    copyR2Object: vi.fn(),
    uploadJson: vi.fn(async (key: string, value: unknown) => { stored.set(key, value); return { r2Key: key, contentType: 'application/json', size: 10 } }),
    uploadBinary: vi.fn(async (key: string, bytes: any, contentType: string) => { stored.set(key, bytes); return { r2Key: key, contentType, size: bytes.byteLength } })
  }
  return { run, deps, stored, fetchAssetPicture, fetchBannerPicture }
}

const headlineRead = { elements: [
  { id: 2, text_only: true, text: 'SUMMER SALE', font_guess: 'Montserrat', font_category: 'sans', font_weight: 800, uppercase: true, align: 'left', color: '#112233' },
  { id: 1, text_only: false }
] }

afterEach(() => vi.unstubAllGlobals())

describe('Separate layers for a Banner Studio upload', () => {
  it('reads the banner upload, not a video asset', async () => {
    const { deps, fetchAssetPicture, fetchBannerPicture } = setup()
    await runAssetIntelligenceProvider({ job: bannerJob, ...deps })
    expect(fetchBannerPicture).toHaveBeenCalledWith(BANNER_ASSET)
    expect(fetchAssetPicture).not.toHaveBeenCalled()
  })

  it('stores every layer picture where Banner Studio can serve it for the person who ran the job', async () => {
    const { deps } = setup()
    const result = await runAssetIntelligenceProvider({ job: bannerJob, ...deps })
    const pictures = result.derivatives.filter(item => item.kind !== 'layer-package')
    expect(pictures).toHaveLength(4)
    for (const picture of pictures) expect(isBannerAssetDeliveryKey(picture.r2Key, USER)).toBe(true)
    // Each picture has its own folder, so two layers can never share an address.
    expect(new Set(pictures.map(picture => picture.r2Key.split('/')[2])).size).toBe(4)
  })

  it('reads the words once and attaches them to the lettering, with the colour taken from the cut-out', async () => {
    const { deps, run, stored } = setup({ textReply: headlineRead })
    const result = await runAssetIntelligenceProvider({ job: bannerJob, ...deps })

    const textCalls = run.mock.calls.filter(([model, inputs]) => model === LAYER_VISION_MODEL && String(inputs.messages[0].content[0].text).includes('lettering and nothing else'))
    expect(textCalls).toHaveLength(1)
    // Layers are numbered back to front: car, headline, logo. The logo is not offered for reading.
    const prompt = String(textCalls[0]![1].messages[0].content[0].text)
    expect(prompt).toContain('id 1: "red car"')
    expect(prompt).toContain('id 2: "headline"')
    expect(prompt).not.toContain('dealer logo')
    expect(textCalls[0]![1].messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)

    const layers = result.derivatives.filter(item => item.kind === 'foreground-png')
    expect(layers.map(layer => layer.metadata.layerName)).toEqual(['red car', 'headline', 'dealer logo'])
    expect(layers[1]!.metadata.text).toMatchObject({ text: 'SUMMER SALE', fontGuess: 'Montserrat', fontWeight: 800, color: '#fac800' })
    expect(layers[0]!.metadata.text).toBeUndefined()
    expect(layers[2]!.metadata.text).toBeUndefined()
    expect(layers[2]!.metadata.layerKind).toBe('logo')

    const manifest = stored.get('video-asset-derivatives/client-7/banner-project-1/job-banner/layers.json')
    expect(manifest.sourceBannerAssetId).toBe(BANNER_ASSET)
    expect(manifest.layers[1].text.text).toBe('SUMMER SALE')
  })

  it('adds the reading call to what the job cost', async () => {
    const { deps } = setup({ textReply: headlineRead })
    const result = await runAssetIntelligenceProvider({ job: bannerJob, ...deps })
    const usage = result.usage as any
    expect(usage.calls.map((call: any) => call.step)).toEqual(['vision', 'extract', 'extract', 'extract', 'base', 'text'])
    // 4 Seedream pictures at $0.028, the element-finding call and the text-reading call.
    expect(usage.costUsd).toBeCloseTo(4 * 0.028 + 0.0024 + 0.0015, 5)
    const pack = result.derivatives.find(item => item.kind === 'layer-package')!
    expect(pack.metadata.costUsd).toBe(usage.costUsd)
    expect(pack.metadata.partial).toBe(false)
  })

  it('still returns every layer when the words cannot be read, and says so', async () => {
    const { deps } = setup({ textError: new Error('gateway 502') })
    const result = await runAssetIntelligenceProvider({ job: bannerJob, ...deps })
    expect(result.derivatives.filter(item => item.kind === 'foreground-png')).toHaveLength(3)
    const pack = result.derivatives.find(item => item.kind === 'layer-package')!
    expect(pack.metadata.partial).toBe(true)
    expect(pack.metadata.skipped).toEqual([{ name: 'Live text', step: 'text', reason: 'The words could not be read: gateway 502.' }])
  })

  it('fails clearly on a Worker that has not been deployed with banner support', async () => {
    const { deps } = setup({ bannerPicture: false })
    await expect(runAssetIntelligenceProvider({ job: bannerJob, ...deps })).rejects.toThrow(/cannot read Banner Studio pictures/)
  })

  it('does not read text for a Video Studio job', async () => {
    const { deps, run } = setup()
    ;(deps.fetchAssetPicture as any).mockResolvedValue({ bytes: sourceJpeg, source: 'picture' })
    const result = await runAssetIntelligenceProvider({ job: { ...bannerJob, sourceBannerAssetId: null, sourceAssetId: 'asset-1' }, ...deps })
    expect(run.mock.calls.filter(([model]) => model === LAYER_VISION_MODEL)).toHaveLength(1)
    expect(result.derivatives.find(item => item.kind === 'foreground-png')!.r2Key).toMatch(/^video-asset-derivatives\/client-7\/banner-project-1\/job-banner\/layer-/)
  })
})

describe('job status for a banner import', () => {
  it('saves derivatives with no video asset behind them and marks the job succeeded', async () => {
    const { deps } = setup({ textReply: headlineRead })
    const created: any[] = []
    const markSucceeded = vi.fn().mockResolvedValue({ id: bannerJob.id, status: 'succeeded' })
    const outcome = await processAssetIntelligenceJob({ jobId: '33333333-3333-4333-8333-333333333333', projectId: 'p', sourceAssetId: BANNER_ASSET }, {
      getJob: vi.fn().mockResolvedValue({ ...bannerJob, status: 'queued' }),
      markRunning: vi.fn().mockResolvedValue({ id: bannerJob.id, status: 'running' }),
      markFailed: vi.fn(),
      markSucceeded,
      createDerivative: vi.fn(async (input: any) => { created.push(input); return { id: `d-${created.length}` } }),
      runProvider: job => runAssetIntelligenceProvider({ job, ...deps })
    })
    expect(outcome).toEqual({ skipped: false, status: 'succeeded' })
    // The message's asset id is a banner asset, so it must never be written as a video asset id.
    expect(created).toHaveLength(5)
    expect(created.every(item => item.sourceAssetId === null)).toBe(true)
    expect(markSucceeded).toHaveBeenCalledWith({ id: bannerJob.id, outputDerivativeIds: ['d-1', 'd-2', 'd-3', 'd-4', 'd-5'] })
  })

  it('marks the job failed with the reason when nothing could be separated', async () => {
    const { deps } = setup()
    ;(deps.env.AI!.run as any).mockImplementation(async () => ({ choices: [{ message: { content: '{"elements":[]}' } }] }))
    const markFailed = vi.fn().mockResolvedValue({ id: bannerJob.id, status: 'failed' })
    const outcome = await processAssetIntelligenceJob({ jobId: '33333333-3333-4333-8333-333333333333', projectId: 'p', sourceAssetId: BANNER_ASSET }, {
      getJob: vi.fn().mockResolvedValue({ ...bannerJob, status: 'queued' }),
      markRunning: vi.fn().mockResolvedValue({ id: bannerJob.id, status: 'running' }),
      markFailed,
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: job => runAssetIntelligenceProvider({ job, ...deps })
    })
    expect(outcome).toEqual({ skipped: false, status: 'failed' })
    expect(markFailed.mock.calls[0]![1]).toMatch(/No separate elements were found/)
  })
})
