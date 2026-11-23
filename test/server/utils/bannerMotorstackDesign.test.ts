import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCurrentMotorstackOffer, motorstackOfferDateIssue } from '~~/shared/bannerMotorstackOffer'
import { motorstackOfferCanvas, protectMotorstackOfferCanvas, refineMotorstackOfferCanvas, resolveMotorstackDesignContext, resolveMotorstackDesignOffer } from '~~/server/utils/banner/motorstackDesign'

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), asset: vi.fn() }))
vi.mock('~~/server/utils/banner/motorstackCreativeCatalog', () => ({ getMotorstackCreativeCatalog: mocks.catalog }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.asset }))
const kitId = '11111111-1111-4111-8111-111111111111'
const assetId = '22222222-2222-4222-8222-222222222222'
const selection = { kitId, offerId: 'a'.repeat(64), assetId, mode: 'create' as const }
const offer = { id: selection.offerId, title: 'Forester offer', model: 'Forester', variant: 'AWD', price: 45990, priceLabel: null, offer: 'Source supporting copy', endDate: '2026-11-30', disclaimer: 'Full source conditions.', hasImage: true, artworkAssetId: 'b'.repeat(64), artworkPreviewUrl: '/private/source', current: true }
const kit = { id: kitId, name: 'Subaru', clientId: null, fonts: [{ role: 'heading', family: 'Source Font', weights: [700], assets: [{ id: 'source-font', weight: 700 }] }], logos: [{ name: 'Source logo', url: 'https://assets.example/logo.png' }], colors: [{ role: 'background', hex: '#ffffff' }, { role: 'primary', hex: '#123456' }] }
const context = () => ({ kit, brandId: 'subaru', offer: { ...offer }, artwork: { id: assetId, mimeType: 'image/png', url: 'https://assets.example/hero.png' }, checkedAt: '2026-11-23T03:00:00.000Z' }) as never
const canvas = () => ({ mrec: { layers: [], bgColor: '#fff' }, ig_story: { layers: [], bgColor: '#fff' } })
const dimensions = { mrec: { w: 300, h: 250 }, ig_story: { w: 1080, h: 1920 } }
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2026-11-23T03:00:00Z'))
  mocks.catalog.mockResolvedValue({ kit, brand: { id: 'subaru' }, items: [{ ...offer }] })
  mocks.asset.mockResolvedValue({ id: assetId, mimeType: 'image/png', url: 'https://assets.example/hero.png' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('current MotorStack design source', () => {
  it('uses Australian calendar dates and rejects invalid source dates', () => {
    expect(isCurrentMotorstackOffer('2026-11-23', new Date('2026-11-22T23:00:00Z'))).toBe(true)
    expect(isCurrentMotorstackOffer('2026-11-22', new Date('2026-11-22T23:00:00Z'))).toBe(false)
    expect(isCurrentMotorstackOffer('2026-02-31')).toBe(false)
    expect(isCurrentMotorstackOffer(null)).toBe(true)
  })
  it('flags explicit availability conflicts without guessing dates from unrelated or ambiguous terms', () => {
    const forester = 'Offer available from 2 November 2026 to 31 December 2026, while stocks last.'
    expect(motorstackOfferDateIssue('2027-01-01', forester)).toContain('2026-12-31')
    expect(motorstackOfferDateIssue('2026-12-31', forester)).toBeNull()
    expect(motorstackOfferDateIssue('2027-01-01', 'Accessories purchased and fitted between 2 November 2026 and 31 December 2026.')).toContain('conflicts')
    expect(motorstackOfferDateIssue('2027-01-01', 'Warranty expires 31 December 2026.')).toBeNull()
    expect(motorstackOfferDateIssue('2027-01-01', 'Offer available from 2 November 2026 to 31 February 2026.')).toBeNull()
    expect(motorstackOfferDateIssue(null, forester)).toBeNull()
  })
  it('blocks contradictory source dates before artwork preparation', async () => {
    mocks.catalog.mockResolvedValue({ kit, brand: { id: 'subaru' }, items: [{ ...offer, endDate: '2027-01-01', disclaimer: 'Offer available from 2 November 2026 to 31 December 2026.' }] })
    await expect(resolveMotorstackDesignContext({} as never, selection, null, 'designer')).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('conflicts') })
    expect(mocks.asset).not.toHaveBeenCalled()
  })
  it('rebinds source identity and kit to the saved client, then verifies exact owner/source artwork', async () => {
    const event = {} as never
    const result = await resolveMotorstackDesignContext(event, selection, 'client', 'designer')
    expect(mocks.catalog).toHaveBeenCalledWith(event, { kitId, kind: 'offers' }, 'client')
    expect(mocks.asset).toHaveBeenCalledWith(expect.stringContaining('uploaded_by = $2'), [assetId, 'designer', ['motorstack-media', 'motorstack-brand:subaru', `motorstack-asset:${offer.artworkAssetId}`]])
    expect(result.artwork?.url).toBe('https://assets.example/hero.png')
  })
  it('rejects changed, removed or expired offers before resolving an asset', async () => {
    await expect(resolveMotorstackDesignOffer({} as never, { ...selection, offerId: 'c'.repeat(64) }, null)).rejects.toMatchObject({ statusCode: 409 })
    mocks.catalog.mockResolvedValue({ kit, brand: { id: 'subaru' }, items: [{ ...offer, endDate: '2026-11-22' }] })
    await expect(resolveMotorstackDesignOffer({} as never, selection, null)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.asset).not.toHaveBeenCalled()
  })
  it('rejects another owner/source asset and unprepared artwork', async () => {
    mocks.asset.mockResolvedValue(null)
    await expect(resolveMotorstackDesignContext({} as never, selection, null, 'designer')).rejects.toMatchObject({ statusCode: 403 })
    await expect(resolveMotorstackDesignContext({} as never, { ...selection, assetId: null }, null, 'designer')).rejects.toMatchObject({ statusCode: 422 })
  })
  it('supports source offers without images without pretending artwork exists', async () => {
    mocks.catalog.mockResolvedValue({ kit, brand: { id: 'subaru' }, items: [{ ...offer, artworkAssetId: null }] })
    expect((await resolveMotorstackDesignContext({} as never, { ...selection, assetId: null }, null, 'designer')).artwork).toBeNull()
    expect(mocks.asset).not.toHaveBeenCalled()
  })
})

describe('editable offer set source preservation', () => {
  it('creates every active size with exact source copy, full terms, retained image and managed fonts', () => {
    const original = canvas()
    const result = motorstackOfferCanvas(original, dimensions, context())
    for (const board of Object.values(result)) {
      expect(board.layers.find(layer => layer.name === 'MotorStack headline')).toMatchObject({ text: offer.title, fontFamily: 'Source Font', fontWeight: 700, fontAssetId: 'source-font' })
      expect(board.layers.find(layer => layer.name === 'MotorStack hero')?.src).toBe('https://assets.example/hero.png')
      expect(board.layers.find(layer => layer.name === 'MotorStack price')?.text).toBe('$45,990')
      expect(board.layers.find(layer => layer.name === 'MotorStack terms 1')?.text).toBe('Full source conditions.\nOffer ends 2026-11-30')
      expect(board.layers.every(layer => Number.isFinite(layer.w) && layer.w > 0)).toBe(true)
    }
    expect(original).toEqual(canvas())
  })
  it('uses the on-dark logo and contrasting button text for a dark kit', () => {
    const source = context() as unknown as { kit: typeof kit }
    source.kit = { ...kit, colors: [{ role: 'background', hex: '#333333' }, { role: 'accent', hex: '#ffff00' }], logos: [{ name: 'White mark', url: 'https://assets.example/white.png', variant: 'dark' } as never, { name: 'Black mark', url: 'https://assets.example/black.png', variant: 'light' } as never] }
    const result = motorstackOfferCanvas(canvas(), dimensions, source as never)
    expect(result.mrec.layers.find(layer => layer.name === 'MotorStack headline')?.color).toBe('#ffffff')
    expect(result.mrec.layers.find(layer => layer.name === 'MotorStack logo')?.src).toBe('https://assets.example/white.png')
    expect(result.mrec.layers.find(layer => layer.name === 'MotorStack CTA')?.textColor).toBe('#111111')
  })

  it('restores source prices, copy and artwork after model edits while retaining layout changes', () => {
    const source = motorstackOfferCanvas(canvas(), dimensions, context())
    const changed = structuredClone(source)
    for (const layer of changed.mrec.layers) {
      if (layer.text) layer.text = 'Invented promotion'
      if (layer.src) layer.src = 'https://other.example/art.png'
      layer.x = 23
      layer.hidden = true
      layer.opacity = 0
    }
    const result = protectMotorstackOfferCanvas(changed, source)
    expect(result.mrec.layers.find(layer => layer.name === 'MotorStack price')).toMatchObject({ text: '$45,990', x: 23, opacity: 1, hidden: false })
    expect(result.mrec.layers.find(layer => layer.name === 'MotorStack hero')?.src).toBe('https://assets.example/hero.png')
  })
  it('rejects added claims, missing terms or source layer/format substitution', () => {
    const source = motorstackOfferCanvas(canvas(), dimensions, context())
    const missing = structuredClone(source)
    missing.mrec.layers.pop()
    expect(() => protectMotorstackOfferCanvas(missing, source)).toThrow()
    const added = structuredClone(source)
    added.mrec.layers.push({ ...added.mrec.layers[0]!, id: 999, type: 'text', text: 'Invented finance rate' })
    expect(() => protectMotorstackOfferCanvas(added, source)).toThrow()
    expect(() => protectMotorstackOfferCanvas({ mrec: source.mrec }, source)).toThrow()
  })
  it('allows source-preserving follow-ups and rejects changed facts before a new model request', () => {
    const source = motorstackOfferCanvas(canvas(), dimensions, context())
    source.mrec.layers[0]!.x = 99
    expect(refineMotorstackOfferCanvas(source, dimensions, context()).mrec.layers[0]!.x).toBe(99)
    source.mrec.layers.find(layer => layer.name === 'MotorStack price')!.text = '$1'
    expect(() => refineMotorstackOfferCanvas(source, dimensions, context())).toThrow()
  })
  it('splits long source terms without truncating them', () => {
    const source = context() as unknown as { offer: typeof offer }
    source.offer.disclaimer = 'Source terms '.repeat(950)
    const result = motorstackOfferCanvas(canvas(), dimensions, source as never)
    const terms = result.mrec.layers.filter(layer => layer.name.startsWith('MotorStack terms')).map(layer => layer.text).join('')
    expect(terms).toBe(`${source.offer.disclaimer}\nOffer ends 2026-11-30`)
    expect(result.mrec.layers.filter(layer => layer.name.startsWith('MotorStack terms')).every(layer => layer.text!.length <= 9000)).toBe(true)
  })
})
