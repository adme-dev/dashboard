import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAX_LAYERS,
  HARD_MAX_LAYERS,
  LAYER_VISION_MODEL,
  LayerDecompositionError,
  SEEDREAM_LAYER_MODEL,
  buildBaseInputs,
  buildExtractInputs,
  buildVisionPrompt,
  decomposeImageToLayers,
  estimateDecomposeCostUsd,
  isolateLayer,
  layerModelFrame,
  layersWithinBudget,
  parseVisionElements,
  resolveMaxLayers,
  seedreamBoxTag,
  seedreamCallCostUsd,
  seedreamImageUrl,
  type LayerCodec,
  type RgbaImage
} from '~~/server/utils/image-layers/decompose'

// A stand-in codec: "encoded" bytes are a 8-byte size header followed by raw RGBA.
const codec: LayerCodec = {
  decode(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(0)
    const height = view.getUint32(4)
    if (!width || !height) throw new Error('The picture could not be read.')
    return { width, height, data: bytes.slice(8) }
  },
  encodePng: encode,
  encodeJpeg: image => encode(image),
  resize(image, width, height) {
    // Nearest neighbour is enough for the tests.
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sx = Math.min(image.width - 1, Math.floor((x / width) * image.width))
        const sy = Math.min(image.height - 1, Math.floor((y / height) * image.height))
        data.set(image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4), (y * width + x) * 4)
      }
    }
    return { width, height, data }
  }
}

function encode(image: RgbaImage): Uint8Array {
  const bytes = new Uint8Array(8 + image.data.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, image.width)
  view.setUint32(4, image.height)
  bytes.set(image.data, 8)
  return bytes
}

function solid(width: number, height: number, alpha = 255): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) data.set([200, 100, 50, alpha], index * 4)
  return { width, height, data }
}

/** A transparent canvas with one opaque rectangle. */
function canvasWithRect(width: number, height: number, rect: { x: number, y: number, w: number, h: number }): RgbaImage {
  const image = solid(width, height, 0)
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) image.data[(y * width + x) * 4 + 3] = 255
  }
  return image
}

const visionReply = (elements: unknown[], usage = { prompt_tokens: 1000, total_tokens: 1400 }) => ({
  choices: [{ message: { content: '```json\n' + JSON.stringify({ elements }) + '\n```' } }],
  usage
})

// 1280 x 720 is exactly the smallest size Seedream accepts, so no resize happens.
const SOURCE = { width: 1280, height: 720 }

/** A fake gateway: Gemini returns `elements`; Seedream returns a URL that `fetchBytes` resolves. */
function fakeGateway(input: {
  elements?: unknown[]
  outputs?: Record<string, RgbaImage | Error>
  base?: RgbaImage | Error
  visionError?: Error
}) {
  const store = new Map<string, RgbaImage>()
  let counter = 0
  const run = vi.fn(async (model: string, inputs: Record<string, any>) => {
    if (model === LAYER_VISION_MODEL) {
      if (input.visionError) throw input.visionError
      return visionReply(input.elements ?? [])
    }
    const prompt = String(inputs.prompt)
    let output: RgbaImage | Error | undefined
    if (prompt.startsWith('Remove these elements')) output = input.base ?? solid(SOURCE.width, SOURCE.height)
    else output = Object.entries(input.outputs ?? {}).find(([name]) => prompt.includes(name))?.[1]
    if (!output) throw new Error(`no fake output for: ${prompt.slice(0, 60)}`)
    if (output instanceof Error) throw output
    counter += 1
    const url = `https://outputs.example/${counter}.png`
    store.set(url, output)
    return { state: 'Completed', result: { images: [url] } }
  })
  const fetchBytes = vi.fn(async (url: string) => encode(store.get(url)!))
  return { run, fetchBytes }
}

describe('reading the vision model\'s element list', () => {
  it('reads fenced JSON with box_2d as [ymin, xmin, ymax, xmax] on a 0-1000 scale', () => {
    const elements = parseVisionElements(visionReply([
      { name: 'coffee bag', kind: 'product', box_2d: [90, 443, 892, 716], z: 2 },
      { name: 'SHOP NOW button', kind: 'Button', box_2d: [811, 752, 911, 946], z: 4 }
    ]), 8)
    expect(elements).toEqual([
      { name: 'coffee bag', kind: 'product', z: 2, left: 0.443, top: 0.09, right: 0.716, bottom: 0.892 },
      { name: 'SHOP NOW button', kind: 'button', z: 4, left: 0.752, top: 0.811, right: 0.946, bottom: 0.911 }
    ])
  })

  it('also accepts bbox as [x1, y1, x2, y2], bare JSON, and JSON wrapped in prose', () => {
    expect(parseVisionElements({ response: '{"elements":[{"name":"logo","bbox":[100,200,300,400]}]}' }, 8)).toEqual([
      { name: 'logo', kind: 'graphic', z: 1, left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 }
    ])
    expect(parseVisionElements('Here you go: {"elements":[{"name":"logo","box_2d":[200,100,400,300]}]} Hope that helps.', 8)).toHaveLength(1)
  })

  it('drops boxes that are empty, inverted, malformed, or the size of the whole picture', () => {
    const elements = parseVisionElements(visionReply([
      { name: 'inverted', box_2d: [500, 500, 400, 400] },
      { name: 'sliver', box_2d: [100, 100, 104, 900] },
      { name: 'background', box_2d: [0, 0, 1000, 1000] },
      { name: 'three numbers', box_2d: [1, 2, 3] },
      { name: 'not numbers', box_2d: ['a', 'b', 'c', 'd'] },
      { name: 'no box' },
      null,
      { name: 'kept', box_2d: [100, 100, 300, 300] }
    ]), 8)
    expect(elements.map(element => element.name)).toEqual(['kept'])
  })

  it('clamps boxes that run past the edge and names unnamed elements', () => {
    const [element] = parseVisionElements(visionReply([{ box_2d: [-50, 900, 500, 1200] }]), 8)
    expect(element).toMatchObject({ name: 'Element 1', left: 0.9, top: 0, right: 1, bottom: 0.5 })
  })

  it('returns nothing for text that is not JSON', () => {
    expect(parseVisionElements({ choices: [{ message: { content: 'I cannot see any elements.' } }] }, 8)).toEqual([])
    expect(parseVisionElements(null, 8)).toEqual([])
  })

  it('stops at the layer cap', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ name: `e${index}`, box_2d: [100, 100, 300, 300] }))
    expect(parseVisionElements(visionReply(many), 5)).toHaveLength(5)
  })
})

describe('layer cap', () => {
  it('defaults to 8 and never goes above 12', () => {
    expect(DEFAULT_MAX_LAYERS).toBe(8)
    expect(resolveMaxLayers(undefined)).toBe(8)
    expect(resolveMaxLayers(null)).toBe(8)
    expect(resolveMaxLayers(0)).toBe(8)
    expect(resolveMaxLayers(Number.NaN)).toBe(8)
    expect(resolveMaxLayers(3)).toBe(3)
    expect(resolveMaxLayers(10.9)).toBe(10)
    expect(resolveMaxLayers(99)).toBe(HARD_MAX_LAYERS)
  })

  it('tells the vision model the cap', () => {
    expect(buildVisionPrompt(6)).toContain('Return at most 6 elements')
    expect(buildVisionPrompt(6, ' only the text ')).toContain('The editor asked for: only the text')
  })
})

describe('request building', () => {
  it('keeps a picture that is already inside Seedream\'s range at its own size', () => {
    expect(layerModelFrame(1664, 936)).toEqual({ width: 1664, height: 936 })
    expect(layerModelFrame(1280, 720)).toEqual({ width: 1280, height: 720 })
  })

  it('scales small pictures up and large ones down, keeping the shape and staying in range', () => {
    const small = layerModelFrame(640, 360)
    expect(small.width * small.height).toBeGreaterThanOrEqual(921_600)
    expect(small.width / small.height).toBeCloseTo(16 / 9, 2)
    const large = layerModelFrame(3840, 2160)
    expect(large.width * large.height).toBeLessThanOrEqual(2_601_123)
    expect(large.width * large.height).toBeGreaterThan(2_500_000)
    expect(large.width / large.height).toBeCloseTo(16 / 9, 2)
  })

  it('refuses pictures Seedream cannot take', () => {
    expect(() => layerModelFrame(4000, 200)).toThrow('too long and thin')
    expect(() => layerModelFrame(0, 100)).toThrow(LayerDecompositionError)
  })

  it('writes Seedream box tags as x1 y1 x2 y2 on a 0-999 scale', () => {
    expect(seedreamBoxTag({ left: 0.443, top: 0.09, right: 0.716, bottom: 0.892 })).toBe('<bbox>443 90 715 891</bbox>')
    expect(seedreamBoxTag({ left: 0, top: 0, right: 1, bottom: 1 })).toBe('<bbox>0 0 999 999</bbox>')
  })

  it('asks for one element, in place, on a transparent PNG with no watermark', () => {
    const inputs = buildExtractInputs({
      element: { name: 'price badge', kind: 'badge', z: 1, left: 0.1, top: 0.7, right: 0.3, bottom: 0.9 },
      imageDataUri: 'data:image/jpeg;base64,AAAA',
      frame: { width: 1664, height: 936 },
      guidance: 'keep the folded corner'
    })
    expect(inputs).toMatchObject({
      image: 'data:image/jpeg;base64,AAAA',
      background: 'transparent',
      output_format: 'png',
      size: '1664x936',
      watermark: false
    })
    expect(inputs.prompt).toContain('Extract only the price badge at <bbox>100 699 300 899</bbox>')
    expect(inputs.prompt).toContain('exactly the same position, size and angle')
    expect(inputs.prompt).toContain('The editor asked for: keep the folded corner')
    // Only fields Cloudflare's schema for bytedance/seedream-5.5 accepts; anything else is rejected with 7003.
    expect(Object.keys(inputs).sort()).toEqual(['background', 'image', 'output_format', 'prompt', 'size', 'watermark'])
  })

  it('words a whole-picture box as background removal', () => {
    const inputs = buildExtractInputs({
      element: { name: 'main subject', kind: 'subject', z: 1, left: 0, top: 0, right: 1, bottom: 1 },
      imageDataUri: 'data:image/jpeg;base64,AAAA',
      frame: { width: 1280, height: 720 }
    })
    expect(inputs.prompt).toContain('Remove the background from this image and keep only the main subject.')
    expect(inputs.prompt).not.toContain('<bbox>')
  })

  it('asks for an opaque base with every lifted element removed', () => {
    const inputs = buildBaseInputs({
      elements: [
        { name: 'headline', kind: 'text', z: 1, left: 0.05, top: 0.1, right: 0.4, bottom: 0.3 },
        { name: 'logo', kind: 'logo', z: 2, left: 0.8, top: 0.05, right: 0.95, bottom: 0.15 }
      ],
      imageDataUri: 'data:image/jpeg;base64,AAAA',
      frame: { width: 1280, height: 720 }
    })
    expect(inputs).toMatchObject({ background: 'opaque', output_format: 'png', size: '1280x720', watermark: false })
    expect(inputs.prompt).toContain('the headline at <bbox>50 100 400 300</bbox>; the logo at <bbox>799 50 949 150</bbox>')
  })

  it('finds the output URL in both the binding and the REST response shapes', () => {
    expect(seedreamImageUrl({ state: 'Completed', result: { images: ['https://a/1.png'] } })).toBe('https://a/1.png')
    expect(seedreamImageUrl({ success: true, result: { state: 'Completed', result: { images: ['https://a/2.png'] } } })).toBe('https://a/2.png')
    expect(seedreamImageUrl({ state: 'Failed', result: {} })).toBeNull()
    expect(seedreamImageUrl(null)).toBeNull()
  })
})

describe('mapping the model\'s output to a layer and its box', () => {
  it('crops to what was drawn and reports its bounds on the canvas', () => {
    const output = canvasWithRect(1000, 500, { x: 200, y: 100, w: 300, h: 150 })
    const isolated = isolateLayer(output, { left: 0.19, top: 0.19, right: 0.51, bottom: 0.51 })
    expect(isolated).toMatchObject({ left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 })
    expect((isolated as any).image).toMatchObject({ width: 300, height: 150 })
    // Every pixel of the crop is the opaque rectangle.
    expect((isolated as any).image.data.filter((_: number, index: number) => index % 4 === 3).every((alpha: number) => alpha === 255)).toBe(true)
  })

  it('ignores stray pixels far from the requested box so they cannot stretch the layer', () => {
    const output = canvasWithRect(1000, 500, { x: 200, y: 100, w: 300, h: 150 })
    // A stray blob in the opposite corner.
    for (let y = 450; y < 480; y += 1) for (let x = 900; x < 950; x += 1) output.data[(y * 1000 + x) * 4 + 3] = 255
    const isolated = isolateLayer(output, { left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 })
    expect(isolated).toMatchObject({ left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 })
  })

  it('allows the element to be a little larger than the box it was asked for', () => {
    const output = canvasWithRect(1000, 500, { x: 180, y: 90, w: 340, h: 170 })
    const isolated = isolateLayer(output, { left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 })
    expect(isolated).toMatchObject({ left: 0.18, top: 0.18, right: 0.52, bottom: 0.52 })
  })

  it('says so when the model returned nothing', () => {
    expect(isolateLayer(solid(400, 200, 0), { left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 }))
      .toEqual({ reason: 'the model returned nothing for this element' })
  })

  it('says so when the model returned the whole picture instead of a cut-out', () => {
    expect(isolateLayer(solid(400, 200, 255), { left: 0.2, top: 0.2, right: 0.5, bottom: 0.5 }))
      .toEqual({ reason: 'the model returned the whole picture instead of a cut-out' })
  })
})

describe('cost', () => {
  it('prices one Seedream call from the published rates', () => {
    expect(seedreamCallCostUsd(1664 * 936)).toBeCloseTo(0.028, 5)
    expect(seedreamCallCostUsd(2048 * 2048)).toBeCloseTo(0.043, 5)
  })

  it('estimates a whole job and works out how many layers a budget allows', () => {
    expect(estimateDecomposeCostUsd({ layers: 6, includeBase: true, vision: true, framePixels: 1_557_504 })).toBeCloseTo(0.201, 5)
    expect(estimateDecomposeCostUsd({ layers: 1, includeBase: false, vision: false, framePixels: 1_557_504 })).toBeCloseTo(0.028, 5)
    expect(layersWithinBudget({ maxCostUsd: 0.5, includeBase: true, vision: true, framePixels: 1_557_504 })).toBe(16)
    expect(layersWithinBudget({ maxCostUsd: 0.1, includeBase: true, vision: true, framePixels: 1_557_504 })).toBe(2)
    expect(layersWithinBudget({ maxCostUsd: 0.028, includeBase: false, vision: false, framePixels: 1_557_504 })).toBe(1)
    expect(layersWithinBudget({ maxCostUsd: 0.03, includeBase: true, vision: true, framePixels: 1_557_504 })).toBe(0)
  })
})

describe('decomposeImageToLayers', () => {
  const source = encode(solid(SOURCE.width, SOURCE.height))
  const headline = { name: 'headline', kind: 'text', box_2d: [100, 50, 300, 450], z: 2 }
  const product = { name: 'product', kind: 'product', box_2d: [400, 300, 900, 700], z: 1 }
  const headlineOutput = canvasWithRect(1280, 720, { x: 64, y: 72, w: 512, h: 144 })
  const productOutput = canvasWithRect(1280, 720, { x: 384, y: 288, w: 512, h: 360 })

  it('returns a base and layers back to front, with boxes in source pixels', async () => {
    const gateway = fakeGateway({ elements: [headline, product], outputs: { headline: headlineOutput, product: productOutput } })
    const result = await decomposeImageToLayers(source, { metadata: { jobId: 'job-1' } }, { ...gateway, codec })

    expect(result).toMatchObject({ width: 1280, height: 720, skipped: [] })
    expect(result.layers.map(layer => ({ name: layer.name, z: layer.z, kind: layer.kind, bbox: layer.bbox, width: layer.width, height: layer.height }))).toEqual([
      { name: 'product', z: 1, kind: 'product', bbox: { x: 384, y: 288, width: 512, height: 360 }, width: 512, height: 360 },
      { name: 'headline', z: 2, kind: 'text', bbox: { x: 64, y: 72, width: 512, height: 144 }, width: 512, height: 144 }
    ])
    expect(codec.decode(result.layers[0]!.png)).toMatchObject({ width: 512, height: 360 })
    expect(result.base).toMatchObject({ width: 1280, height: 720 })

    // One vision call, one extraction per element, one base call.
    const models = gateway.run.mock.calls.map(call => call[0])
    expect(models.filter(model => model === LAYER_VISION_MODEL)).toHaveLength(1)
    expect(models.filter(model => model === SEEDREAM_LAYER_MODEL)).toHaveLength(3)
    // Every call carries the caller's metadata to the default gateway.
    for (const call of gateway.run.mock.calls) {
      expect(call[2]).toEqual({ gateway: { id: 'default', metadata: { feature: 'image-layers', jobId: 'job-1' } } })
    }
  })

  it('reports cost and latency for the job and for each call', async () => {
    const gateway = fakeGateway({ elements: [headline, product], outputs: { headline: headlineOutput, product: productOutput } })
    let clock = 1_000
    const result = await decomposeImageToLayers(source, {}, { ...gateway, codec, now: () => (clock += 500) })

    expect(result.usage.calls.map(call => call.step)).toEqual(['vision', 'extract', 'extract', 'base'])
    // Vision: 1000 input tokens and 400 output tokens at Gemini's rates; three Seedream calls at 2.8 cents.
    expect(result.usage.calls[0]).toMatchObject({ model: LAYER_VISION_MODEL, costUsd: 0.00225, ok: true })
    expect(result.usage.calls.slice(1).every(call => call.costUsd === 0.028 && call.ok)).toBe(true)
    expect(result.usage.costUsd).toBeCloseTo(0.08625, 5)
    expect(result.usage.latencyMs).toBeGreaterThan(0)
    expect(result.usage.calls.every(call => call.ms > 0)).toBe(true)
  })

  it('maps boxes back to source pixels when the picture had to be resized for the model', async () => {
    // 640 x 360 is below Seedream's minimum, so the model works on a 1280 x 720 frame.
    const small = encode(solid(640, 360))
    const gateway = fakeGateway({ elements: [headline], outputs: { headline: headlineOutput } })
    const result = await decomposeImageToLayers(small, { includeBase: false }, { ...gateway, codec })

    expect(result).toMatchObject({ width: 640, height: 360, base: null })
    // The layer PNG stays at the model's resolution; its box is in the 640 x 360 source.
    expect(result.layers[0]).toMatchObject({ width: 512, height: 144, bbox: { x: 32, y: 36, width: 256, height: 72 } })
    expect(gateway.run.mock.calls[1]![1]).toMatchObject({ size: '1280x720' })
  })

  it('caps the number of layers, by default at 8 and at the requested number when given', async () => {
    const many = Array.from({ length: 15 }, (_, index) => ({ name: `item${String(index).padStart(2, '0')}`, box_2d: [100, 50, 300, 450], z: index + 1 }))
    const outputs = Object.fromEntries(many.map(item => [item.name, headlineOutput]))

    const byDefault = await decomposeImageToLayers(source, {}, { ...fakeGateway({ elements: many, outputs }), codec })
    expect(byDefault.layers).toHaveLength(8)

    const capped = await decomposeImageToLayers(source, { maxLayers: 3 }, { ...fakeGateway({ elements: many, outputs }), codec })
    expect(capped.layers).toHaveLength(3)

    const overLimit = await decomposeImageToLayers(source, { maxLayers: 50, maxCostUsd: 5 }, { ...fakeGateway({ elements: many, outputs }), codec })
    expect(overLimit.layers).toHaveLength(12)
  })

  it('trims the layer count to fit the cost limit', async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ name: `item${index}`, box_2d: [100, 50, 300, 450], z: index + 1 }))
    const outputs = Object.fromEntries(many.map(item => [item.name, headlineOutput]))
    const gateway = fakeGateway({ elements: many, outputs })
    // 10 cents pays for the vision call, the base and two cut-outs.
    const result = await decomposeImageToLayers(source, { maxCostUsd: 0.1 }, { ...gateway, codec })

    expect(result.layers).toHaveLength(2)
    expect(result.usage.costUsd).toBeLessThanOrEqual(0.1)
  })

  it('refuses before any model call when even one layer would exceed the cost limit', async () => {
    const gateway = fakeGateway({ elements: [headline], outputs: { headline: headlineOutput } })
    await expect(decomposeImageToLayers(source, { maxCostUsd: 0.03 }, { ...gateway, codec }))
      .rejects.toMatchObject({ code: 'budget_exceeded', message: 'This job would cost more than the limit of US$0.03 for one run.' })
    expect(gateway.run).not.toHaveBeenCalled()
  })

  it('skips the vision pass when the caller supplies the element, as Lift does', async () => {
    const gateway = fakeGateway({ outputs: { badge: canvasWithRect(1280, 720, { x: 100, y: 500, w: 240, h: 130 }) } })
    const result = await decomposeImageToLayers(source, {
      elements: [{ name: 'badge', box: { x: 96, y: 496, width: 250, height: 140 }, kind: 'lift' }],
      includeBase: false
    }, { ...gateway, codec })

    expect(gateway.run).toHaveBeenCalledTimes(1)
    expect(gateway.run.mock.calls[0]![0]).toBe(SEEDREAM_LAYER_MODEL)
    expect(result.base).toBeNull()
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0]).toMatchObject({ name: 'badge', kind: 'lift', z: 1, bbox: { x: 100, y: 500, width: 240, height: 130 } })
    expect(result.usage.costUsd).toBeCloseTo(0.028, 5)
  })

  it('keeps the layers that worked and lists the ones that did not', async () => {
    const gateway = fakeGateway({
      elements: [headline, product],
      outputs: { headline: headlineOutput, product: new Error('7003: User Input Error') }
    })
    const result = await decomposeImageToLayers(source, {}, { ...gateway, codec })

    expect(result.layers.map(layer => layer.name)).toEqual(['headline'])
    expect(result.skipped).toEqual([{ name: 'product', step: 'extract', reason: 'the image service rejected the request' }])
    // A refused call is not billed.
    expect(result.usage.calls.find(call => call.element === 'product')).toMatchObject({ ok: false, costUsd: 0 })
    // The base only removes what was actually lifted.
    const basePrompt = String(gateway.run.mock.calls.at(-1)![1].prompt)
    expect(basePrompt).toContain('the headline at')
    expect(basePrompt).not.toContain('product')
  })

  it('skips an element the model drew as nothing, and still bills the call', async () => {
    const gateway = fakeGateway({ elements: [headline, product], outputs: { headline: solid(1280, 720, 0), product: productOutput } })
    const result = await decomposeImageToLayers(source, { includeBase: false }, { ...gateway, codec })

    expect(result.layers.map(layer => layer.name)).toEqual(['product'])
    expect(result.skipped).toEqual([{ name: 'headline', step: 'extract', reason: 'the model returned nothing for this element' }])
    expect(result.usage.calls.find(call => call.element === 'headline')).toMatchObject({ ok: true, costUsd: 0.028 })
  })

  it('returns the layers with no base when only the base call fails', async () => {
    const gateway = fakeGateway({ elements: [headline], outputs: { headline: headlineOutput }, base: new Error('upstream timeout') })
    const result = await decomposeImageToLayers(source, {}, { ...gateway, codec })

    expect(result.layers).toHaveLength(1)
    expect(result.base).toBeNull()
    expect(result.skipped).toEqual([{ name: 'Base picture', step: 'base', reason: 'upstream timeout' }])
  })

  it.each([
    ['vision_failed', { visionError: new Error('gateway unavailable') }, 'Could not find the elements in this picture: gateway unavailable.'],
    ['no_elements', { elements: [] }, 'No separate elements were found in this picture. Try Lift and paint over the part you want.'],
    ['extraction_failed', { elements: [headline], outputs: { headline: new Error('7003: User Input Error') } }, 'None of the 1 element could be cut out: the image service rejected the request.']
  ] as const)('fails with %s and a message for the person who ran it', async (code, setup, message) => {
    const gateway = fakeGateway(setup as any)
    const error = await decomposeImageToLayers(source, {}, { ...gateway, codec }).catch(caught => caught)

    expect(error).toBeInstanceOf(LayerDecompositionError)
    expect(error).toMatchObject({ code, message })
    // What was spent before the failure is still reported.
    expect(error.usage.calls.length).toBeGreaterThan(0)
  })

  it('fails with invalid_image when the picture cannot be decoded', async () => {
    const gateway = fakeGateway({})
    await expect(decomposeImageToLayers(new Uint8Array(8), {}, { ...gateway, codec }))
      .rejects.toMatchObject({ code: 'invalid_image', message: 'The picture could not be read.' })
    expect(gateway.run).not.toHaveBeenCalled()
  })

  it('never fetches a result from a non-https address', async () => {
    const run = vi.fn().mockResolvedValue({ state: 'Completed', result: { images: ['http://169.254.169.254/latest'] } })
    const fetchBytes = vi.fn()
    await expect(decomposeImageToLayers(source, {
      elements: [{ name: 'badge', box: { x: 96, y: 496, width: 250, height: 140 } }],
      includeBase: false
    }, { run, fetchBytes, codec })).rejects.toMatchObject({ code: 'extraction_failed' })
    expect(fetchBytes).not.toHaveBeenCalled()
  })
})
