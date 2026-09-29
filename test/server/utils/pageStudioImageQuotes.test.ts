import { describe, expect, it } from 'vitest'
import { buildImageQuote, imageModelCatalog, readImageGenerationConfig } from '~~/server/utils/pageStudio/imageQuotes'

const scope = { tenantId: 'tenant_test', clientId: '10000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000003', businessId: '10000000-0000-4000-8000-000000000001', environment: 'staging' as const }
const raw = { gatewayId: 'studio-images-staging', priceVersion: 'synthetic-v1', scopes: [scope], models: [
  { id: '@cf/black-forest-labs/flux-1-schnell', credits: 10 },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', credits: 20 }
] }
const config = () => readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify(raw) }, scope)
const request = { intentId: '10000000-0000-4000-8000-000000000010', modelId: raw.models[0]!.id, prompt: 'Warm abstract sunlight on linen', aspect: 'native' }
const actor = { actorId: 'editor_1', actorRole: 'client' as const }
const now = new Date('2026-09-30T00:00:00Z')

describe('server-owned image quotes', () => {
  it('fails closed until a named gateway, scoped admission and valid prices are configured', () => {
    for (const invalid of [undefined, '{}', JSON.stringify({ ...raw, gatewayId: '' }), JSON.stringify({ ...raw, models: [{ id: 'https://attacker.test/model', credits: 1 }] }), JSON.stringify({ ...raw, models: [{ id: raw.models[0]!.id, credits: 0.1 }] })]) {
      expect(() => readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: invalid }, scope)).toThrow()
    }
    expect(() => readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify(raw) }, { ...scope, siteId: '40000000-0000-4000-8000-000000000004' })).toThrow()
    expect(() => readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify({ ...raw, scopes: [{ ...scope, environment: 'production' }] }) }, { ...scope, environment: 'production' })).toThrow()
  })
  it('exposes actual models and only their supported image controls', () => {
    expect(imageModelCatalog(config()).map(model => ({ id: model.id, credits: model.credits, aspects: model.aspects }))).toEqual([
      { id: raw.models[0]!.id, credits: 10, aspects: ['native'] },
      { id: raw.models[1]!.id, credits: 20, aspects: ['1:1', '16:9', '3:2'] }
    ])
  })
  it('binds exact price, scope, actor and normalized prompt with a bounded expiry', async () => {
    const quote = await buildImageQuote(config(), scope, actor, { ...request, prompt: `  ${request.prompt}  ` }, now)
    expect(quote).toMatchObject({ credits: 10, priceVersion: 'synthetic-v1', prompt: request.prompt, modelId: request.modelId,
      expiresAt: '2026-09-30T00:10:00.000Z', scope, actor })
    expect((await buildImageQuote(config(), scope, actor, { ...request, prompt: 'Abstract dawn 🌅' }, now)).prompt).toBe('Abstract dawn 🌅')
    expect(quote.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect((await buildImageQuote(config(), scope, actor, request, now)).fingerprint).toBe(quote.fingerprint)
    expect((await buildImageQuote(config(), scope, { ...actor, actorId: 'editor_2' }, request, now)).fingerprint).not.toBe(quote.fingerprint)
    expect((await buildImageQuote(config(), scope, actor, { ...request, prompt: 'Different abstract artwork' }, now)).fingerprint).not.toBe(quote.fingerprint)
  })
  it('does not accept browser prices, scopes, provider endpoints or unknown parameters', async () => {
    for (const extra of [{ credits: 1 }, { scope }, { url: 'https://attacker.test' }, { width: 4096 }, { outputCount: 2 }, { priceVersion: 'free' }]) {
      await expect(buildImageQuote(config(), scope, actor, { ...request, ...extra }, now)).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(buildImageQuote(config(), scope, actor, { ...request, modelId: 'unknown' }, now)).rejects.toMatchObject({ statusCode: 400 })
    await expect(buildImageQuote(config(), scope, actor, { ...request, aspect: '16:9' }, now)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('preserves vehicle-source restrictions and refuses empty or oversized prompts', async () => {
    for (const prompt of [' ', 'x'.repeat(2049), 'abstract \u0000 art', 'abstract \ud800 art', 'Create a new Toyota SUV photo', 'A realistic automotive grille']) {
      await expect(buildImageQuote(config(), scope, actor, { ...request, prompt }, now)).rejects.toMatchObject({ statusCode: 400 })
    }
  })
})
