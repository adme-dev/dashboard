import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/page-studio/image-generation.json'
import { ImageAssetSchema, ImageClaimSchema, ImageEditorResponseSchemas, ImageQuoteRequestSchema, ImageQuoteSchema, ImageWorkerDeliverySchema } from '~~/shared/pageStudio/imageGeneration'

describe('image generation wire contracts', () => {
  it('accepts the native golden quote, asset, dispatch and editor receipts', () => {
    expect(ImageQuoteSchema.parse(fixture.quote)).toEqual(fixture.quote)
    expect(ImageAssetSchema.parse(fixture.asset)).toEqual(fixture.asset)
    expect(ImageClaimSchema.parse(fixture.claim)).toEqual(fixture.claim)
    expect(ImageEditorResponseSchemas.read.parse(fixture.read)).toEqual(fixture.read)
    expect(ImageWorkerDeliverySchema.parse(fixture.delivery)).toEqual(fixture.delivery)
  })
  it('refuses caller price, scope, model URL and malformed prompts', () => {
    for (const patch of [{ credits: 0 }, { scope: fixture.quote.scope }, { modelId: 'https://attacker.test' }, { prompt: 'text\u0000' }]) {
      expect(ImageQuoteRequestSchema.safeParse({ ...fixture.request, ...patch }).success).toBe(false)
    }
  })
  it('refuses mismatched image identity, URLs and unsafe output bounds', () => {
    for (const patch of [{ path: 'https://attacker.test/image.png' }, { sha256: 'c'.repeat(64) }, { contentType: 'image/svg+xml' }, { width: 10000 }, { bytes: 11 * 1024 * 1024 }]) {
      expect(ImageAssetSchema.safeParse({ ...fixture.asset, ...patch }).success).toBe(false)
    }
  })
  it('never includes invocation credentials in public job receipts', () => {
    expect(ImageEditorResponseSchemas.read.safeParse({ ...fixture.read, job: { ...fixture.read.job, dispatchToken: fixture.claim.dispatchToken } }).success).toBe(false)
    expect(ImageClaimSchema.safeParse({ admitted: false, dispatchToken: fixture.claim.dispatchToken }).success).toBe(false)
  })
  it('rejects queue messages carrying prompts or prices', () => {
    expect(ImageWorkerDeliverySchema.safeParse({ ...fixture.delivery, prompt: 'injected' }).success).toBe(false)
    expect(ImageWorkerDeliverySchema.safeParse({ ...fixture.delivery, credits: 1 }).success).toBe(false)
  })
})
