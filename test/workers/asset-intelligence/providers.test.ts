import { describe, expect, it, vi } from 'vitest'
import { runAssetIntelligenceProvider } from '~~/workers/asset-intelligence/src/providers'
import { decodePicture, encodeJpeg, encodePng } from '~~/workers/asset-intelligence/src/imageCodec'
import type { RgbaImage } from '~~/workers/asset-intelligence/src/eraseComposite'

describe('asset intelligence providers', () => {
  it('turns mask-only jobs into a persisted mask derivative without calling AI', async () => {
    const copyR2Object = vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/tenant-1/project-1/job-1/mask.png', contentType: 'image/png', size: 128 })
    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        prompt: null,
        brushMaskKey: 'video-asset-masks/project-1/asset-1/mask.png',
      },
      env: { AI: { run: vi.fn() } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object,
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })

    expect(copyR2Object).toHaveBeenCalledWith(
      'video-asset-masks/project-1/asset-1/mask.png',
      'video-asset-derivatives/tenant-1/project-1/job-1/mask.png'
    )
    expect(result.derivatives).toEqual([
      expect.objectContaining({
        kind: 'mask-png',
        r2Key: 'video-asset-derivatives/tenant-1/project-1/job-1/mask.png',
      }),
    ])
    expect(result.derivatives[0].metadata).toMatchObject({ sourceMaskKey: 'video-asset-masks/project-1/asset-1/mask.png' })
  })

  it('runs Workers AI analysis jobs and writes analysis JSON', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'hero vehicle, red sand, logo visible' })
    const uploadJson = vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/tenant-1/project-1/job-2/analysis.json', contentType: 'application/json', size: 64 })

    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-2',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/kimi-planner',
        provider: 'workers-ai',
        prompt: 'analyze this asset',
        brushMaskKey: null,
      },
      env: { AI: { run } } as any,
      fetchAssetBytes: vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AA==', contentType: 'image/png' }),
      copyR2Object: vi.fn(),
      uploadJson,
      uploadBinary: vi.fn(),
    })

    expect(run).toHaveBeenCalled()
    expect(uploadJson).toHaveBeenCalledWith(
      'video-asset-derivatives/tenant-1/project-1/job-2/analysis.json',
      expect.any(Object)
    )
    expect(result.derivatives[0]).toMatchObject({ kind: 'analysis-json' })
  })

  describe('erase and heal', () => {
    const solid = (width: number, height: number, rgba: [number, number, number, number]): RgbaImage => {
      const data = new Uint8Array(width * height * 4)
      for (let index = 0; index < width * height; index += 1) data.set(rgba, index * 4)
      return { width, height, data }
    }
    const pixel = (image: RgbaImage, x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)]
    // A brush mask as the studio uploads it: transparent, with opaque strokes.
    const brushMask = (width: number, height: number, rect: { x: number; y: number; w: number; h: number }) => {
      const mask = solid(width, height, [0, 0, 0, 0])
      for (let y = rect.y; y < rect.y + rect.h; y += 1) for (let x = rect.x; x < rect.x + rect.w; x += 1) mask.data.set([0, 255, 150, 235], (y * width + x) * 4)
      return encodePng(mask)
    }
    // What a real edit returns: the same scene, with only the painted area filled in.
    const sceneWithFill = (width: number, height: number, scene: [number, number, number, number], fill: [number, number, number, number], area: { u0: number; v0: number; u1: number; v1: number }) => {
      const image = solid(width, height, scene)
      for (let y = Math.floor(area.v0 * height); y < Math.ceil(area.v1 * height); y += 1) {
        for (let x = Math.floor(area.u0 * width); x < Math.ceil(area.u1 * width); x += 1) image.data.set(fill, (y * width + x) * 4)
      }
      return image
    }
    const eraseJob = {
      id: 'job-5',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      sourceAssetId: 'asset-1',
      action: 'erase-fill',
      modelId: 'workers-ai/flux-edit',
      provider: 'workers-ai',
      prompt: 'remove the sign',
      brushMaskKey: 'video-asset-masks/project-1/asset-1/mask.png',
    }
    // The model returns bare base64 JPEG at its own size, like the real one.
    const modelReturns = (image: RgbaImage) => vi.fn().mockResolvedValue({ image: Buffer.from(encodeJpeg(image, 100)).toString('base64') })
    function depsFor(input: { picture: Uint8Array; mask: Uint8Array; run: ReturnType<typeof vi.fn>; source?: 'picture' | 'video-frame' }) {
      const uploads: Array<{ key: string; bytes: Uint8Array; contentType: string }> = []
      return {
        uploads,
        deps: {
          env: { AI: { run: input.run } } as any,
          fetchAssetBytes: vi.fn(),
          fetchAssetPicture: vi.fn().mockResolvedValue({ bytes: input.picture, source: input.source ?? 'picture' }),
          fetchObjectBytes: vi.fn().mockResolvedValue(input.mask),
          copyR2Object: vi.fn(),
          uploadJson: vi.fn(),
          uploadBinary: vi.fn(async (key: string, bytes: ArrayBuffer | Uint8Array, contentType: string) => {
            uploads.push({ key, bytes: bytes as Uint8Array, contentType })
            return { r2Key: key, contentType, size: (bytes as Uint8Array).byteLength }
          }),
        },
      }
    }

    it('reads the painted mask, sends a highlighted picture to the edit model, and changes only the painted region', async () => {
      // 16:9 original at twice the size of the mask it was painted on.
      const original = solid(640, 360, [20, 60, 120, 255])
      const run = modelReturns(sceneWithFill(640, 368, [20, 60, 120, 255], [230, 220, 40, 255], { u0: 220 / 320, v0: 30 / 180, u1: 280 / 320, v1: 70 / 180 }))
      const { deps, uploads } = depsFor({ picture: encodePng(original), mask: brushMask(320, 180, { x: 220, y: 30, w: 60, h: 40 }), run })

      const result = await runAssetIntelligenceProvider({ job: eraseJob, ...deps })

      // The mask was fetched from storage by its key and read as a picture.
      expect(deps.fetchObjectBytes).toHaveBeenCalledWith('video-asset-masks/project-1/asset-1/mask.png')
      // The edit model, not the text-only one, with multipart picture input and no stray fields.
      expect(run).toHaveBeenCalledTimes(1)
      const [model, inputs] = run.mock.calls[0]!
      expect(model).toBe('@cf/black-forest-labs/flux-2-klein-4b')
      expect(Object.keys(inputs)).toEqual(['multipart'])
      expect(inputs.multipart.contentType).toMatch(/^multipart\/form-data/)
      const form = await new Response(inputs.multipart.body, { headers: { 'content-type': inputs.multipart.contentType } }).formData()
      expect(form.get('prompt')).toContain('green highlight')
      expect(form.get('prompt')).toContain('remove the sign')
      expect([form.get('width'), form.get('height')]).toEqual(['640', '368'])
      // What the model saw: the original with the painted area tinted green.
      const sent = decodePicture(new Uint8Array(await (form.get('input_image_0') as Blob).arrayBuffer()))
      expect([sent.width, sent.height]).toEqual([640, 368])
      const tinted = pixel(sent, 500, 100)
      expect(tinted[1]).toBeGreaterThan(150)
      expect(tinted[1]).toBeGreaterThan(tinted[0]! + 60)
      const untinted = pixel(sent, 100, 300)
      expect(Math.abs(untinted[0]! - 20)).toBeLessThan(8)
      expect(Math.abs(untinted[2]! - 120)).toBeLessThan(8)

      // The result: full size, lossless, painted region replaced, everything else identical.
      expect(uploads).toHaveLength(1)
      expect(uploads[0]!.key).toBe('video-asset-derivatives/tenant-1/project-1/job-5/edited.png')
      expect(uploads[0]!.contentType).toBe('image/png')
      const output = decodePicture(uploads[0]!.bytes)
      expect([output.width, output.height]).toEqual([640, 360])
      const healed = pixel(output, 500, 100)
      expect(Math.abs(healed[0]! - 230)).toBeLessThan(6)
      expect(Math.abs(healed[2]! - 40)).toBeLessThan(6)
      const region = result.derivatives[0]!.metadata.changedRegion as { x: number; y: number; width: number; height: number }
      let changedOutside = 0
      for (let y = 0; y < 360; y += 1) {
        for (let x = 0; x < 640; x += 1) {
          if (x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) continue
          const [r, g, b] = pixel(output, x, y)
          if (r !== 20 || g !== 60 || b !== 120) changedOutside += 1
        }
      }
      expect(changedOutside).toBe(0)
      expect(region.width * region.height).toBeLessThan(640 * 360 * 0.15)

      expect(result.derivatives[0]).toMatchObject({
        kind: 'edited-image',
        width: 640,
        height: 360,
        metadata: expect.objectContaining({ action: 'erase-fill', modelId: 'workers-ai/flux-edit', source: 'picture', title: 'Erased picture', hasBrushMask: true }),
      })
      expect(result.derivatives[0]!.metadata.note).toBeUndefined()
    })

    it('keeps a large original at full resolution while the model works at about one megapixel', async () => {
      const original = solid(2400, 1350, [10, 10, 10, 255])
      const run = modelReturns(sceneWithFill(1328, 752, [10, 10, 10, 255], [250, 250, 250, 255], { u0: 100 / 1280, v0: 100 / 720, u1: 300 / 1280, v1: 200 / 720 }))
      const { deps, uploads } = depsFor({ picture: encodeJpeg(original), mask: brushMask(1280, 720, { x: 100, y: 100, w: 200, h: 100 }), run })
      const result = await runAssetIntelligenceProvider({ job: eraseJob, ...deps })
      const form = await new Response(run.mock.calls[0]![1].multipart.body, { headers: { 'content-type': run.mock.calls[0]![1].multipart.contentType } }).formData()
      expect([form.get('width'), form.get('height')]).toEqual(['1328', '752'])
      const output = decodePicture(uploads[0]!.bytes)
      expect([output.width, output.height]).toEqual([2400, 1350])
      expect(result.derivatives[0]!.metadata.modelFrame).toEqual({ width: 1328, height: 752 })
      // Painted at mask (200, 150) -> original (375, 281).
      expect(pixel(output, 375, 281)[0]).toBeGreaterThan(240)
      expect(pixel(output, 2000, 1200)[0]).toBeLessThan(20)
    })

    it('says so when the picture came from a video frame: the video is not erased', async () => {
      const run = modelReturns(solid(320, 176, [200, 200, 200, 255]))
      const { deps } = depsFor({ picture: encodePng(solid(320, 180, [0, 0, 0, 255])), mask: brushMask(320, 180, { x: 10, y: 10, w: 40, h: 40 }), run, source: 'video-frame' })
      const result = await runAssetIntelligenceProvider({ job: eraseJob, ...deps })
      expect(result.derivatives[0]!.metadata).toMatchObject({
        source: 'video-frame',
        title: 'Erased still from video frame',
        note: 'Made from the video\'s preview frame. The video itself is unchanged.',
      })
    })

    it.each([
      ['no mask was painted', { brushMaskKey: null }, undefined, 'Erase needs a painted area'],
      ['the mask is empty', {}, () => encodePng(solid(320, 180, [0, 0, 0, 0])), 'Erase needs a painted area'],
      ['the mask was painted on a different shape', {}, () => brushMask(540, 960, { x: 10, y: 10, w: 40, h: 40 }), 'does not match the shape of the picture'],
      ['the mask is not a picture', {}, () => new TextEncoder().encode('video-asset-masks/project-1/asset-1/mask.png'), 'could not be read'],
    ])('fails clearly before calling the model when %s', async (_name, jobPatch, mask, message) => {
      const run = vi.fn()
      const { deps, uploads } = depsFor({ picture: encodePng(solid(320, 180, [0, 0, 0, 255])), mask: mask ? mask() : new Uint8Array(), run })
      await expect(runAssetIntelligenceProvider({ job: { ...eraseJob, ...jobPatch }, ...deps })).rejects.toThrow(message)
      expect(run).not.toHaveBeenCalled()
      expect(uploads).toHaveLength(0)
    })

    it('fails clearly when the source is not a PNG or JPEG picture', async () => {
      const run = vi.fn()
      const { deps } = depsFor({ picture: new TextEncoder().encode('RIFF....WEBPVP8 '), mask: brushMask(320, 180, { x: 1, y: 1, w: 4, h: 4 }), run })
      await expect(runAssetIntelligenceProvider({ job: eraseJob, ...deps })).rejects.toThrow('Only PNG and JPEG pictures can be edited.')
      expect(run).not.toHaveBeenCalled()
    })
  })

  it('fails layer-decomposition jobs with a specific external provider setup error', async () => {
    await expect(runAssetIntelligenceProvider({
      job: {
        id: 'job-6',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'layer-decomposition',
        modelId: 'replicate/qwen-image-layered',
        provider: 'replicate',
        prompt: 'separate product and badge',
        brushMaskKey: null,
      },
      env: { AI: { run: vi.fn() } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object: vi.fn(),
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })).rejects.toThrow('layer-decomposition requires configured provider runtime: replicate/qwen-image-layered')
  })

  it('rejects asset-analysis jobs for unsupported providers before calling AI', async () => {
    const run = vi.fn()

    await expect(runAssetIntelligenceProvider({
      job: {
        id: 'job-3',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/kimi-planner',
        provider: 'replicate',
        prompt: 'analyze this asset',
        brushMaskKey: null,
      },
      env: { AI: { run } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object: vi.fn(),
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })).rejects.toThrow('asset-analysis requires provider workers-ai')

    expect(run).not.toHaveBeenCalled()
  })

  it('rejects asset-analysis jobs for unsupported models before calling AI', async () => {
    const run = vi.fn()

    await expect(runAssetIntelligenceProvider({
      job: {
        id: 'job-4',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/other-model',
        provider: 'workers-ai',
        prompt: 'analyze this asset',
        brushMaskKey: null,
      },
      env: { AI: { run } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object: vi.fn(),
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })).rejects.toThrow('asset-analysis model not supported: workers-ai/other-model')

    expect(run).not.toHaveBeenCalled()
  })
})
