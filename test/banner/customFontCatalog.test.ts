// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, readonly, ref } from 'vue'
import type { CustomFont } from '../../app/composables/useBannerFonts'

const font = (id: number, weight: number): CustomFont => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, clientId: null, sha256: null, name: 'Imported Brand', mimeType: 'font/woff2', fileSize: 12, r2Key: `font-${id}.woff2`,
  url: `https://media.example.com/font-${id}.woff2`, tags: ['font', `weight:${weight}`, 'format:woff2'],
  uploadedBy: 'test', createdAt: '2026-10-05T00:00:00Z'
})
const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  document.head.innerHTML = ''
  for (const [name, value] of Object.entries({ computed, readonly, ref, $fetch: fetchMock })) vi.stubGlobal(name, value)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function catalog() {
  return (await import('../../app/composables/useBannerFonts')).useBannerFonts()
}

describe('custom font catalog', () => {
  it.each([325, 700])('exports exact weight %s after an empty catalog has already been cached', async (weight) => {
    fetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(font(1, weight))
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'brand.woff2'), 'Imported Brand', weight)
    await fonts.fetchCustomFonts()
    const upload = fetchMock.mock.calls[1][1].body as FormData
    expect(upload.get('family')).toBe('Imported Brand')
    expect(upload.get('weight')).toBe(String(weight))
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }])).toEqual([{ family: 'Imported Brand', url: font(1, weight).url, weight, format: 'woff2' }])
    expect(document.head.textContent).toContain(`font-weight: ${weight};`)
    expect(fonts.buildCustomFontsCss([{ fontFamily: 'Imported Brand' }])).toContain(`font-weight: ${weight};`)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('loads and exports every weight of the same custom family without duplicate family choices', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400), font(2, 700)])
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.loadFont('Imported Brand')
    fonts.loadUsedFonts([{ fontFamily: 'Imported Brand', fontWeight: 700 }])
    expect(fonts.searchFonts('Imported Brand', 'custom')).toEqual([{ family: 'Imported Brand', category: 'custom', weights: [400, 700] }])
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }, { fontFamily: 'Imported Brand' }]).map(f => f.weight)).toEqual([400, 700])
    expect(document.head.querySelectorAll('style')).toHaveLength(2)
    expect(document.head.textContent).toContain('font-weight: 400;')
    expect(document.head.textContent).toContain('font-weight: 700;')
    expect(fonts.buildCustomFontsCss([{ fontFamily: 'Imported Brand' }])).toContain('font-weight: 700;')
  })

  it('keeps an upload when the initial font fetch finishes later with stale empty data', async () => {
    let finishFetch!: (fonts: CustomFont[]) => void
    fetchMock.mockImplementationOnce(() => new Promise<CustomFont[]>((resolve) => {
      finishFetch = resolve
    })).mockResolvedValueOnce(font(1, 300))
    const fonts = await catalog()
    const pendingFetch = fonts.fetchCustomFonts()
    const upload = fonts.uploadCustomFont(new File(['font'], 'brand.woff2'), 'Imported Brand', 300)
    finishFetch([])
    await Promise.all([pendingFetch, upload])
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }])[0].weight).toBe(300)
  })

  it('preserves the old exact face while updating the legacy family selection', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400), font(2, 700)]).mockResolvedValueOnce(font(3, 700))
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'replacement.woff2'), 'Imported Brand', 700)
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }]).map(f => f.url)).toEqual([font(3, 700).url, font(1, 400).url])
    expect(document.head.querySelectorAll('style')).toHaveLength(3)
    expect(document.head.textContent).toContain(font(3, 700).url)
    expect(document.head.textContent).toContain(font(2, 700).url)
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand', fontAssetId: font(2, 700).id }])[0]?.url).toBe(font(2, 700).url)
  })

  it('preserves the existing upload call without a weight and removes only the deleted face', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400)]).mockResolvedValueOnce(font(2, 700)).mockResolvedValueOnce({})
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'brand.woff2'))
    expect((fetchMock.mock.calls[1][1].body as FormData).has('weight')).toBe(false)
    await fonts.deleteCustomFont(font(2, 700).id)
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }]).map(f => f.weight)).toEqual([400])
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(document.head.textContent).toContain('font-weight: 400;')
  })

  it('refreshes cached empty fonts before reusing faces uploaded in another tab, without uploading again', async () => {
    fetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([font(1, 400), font(2, 700)])
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }])).toEqual([])
    const reusable = await fonts.refreshCustomFonts()
    expect(reusable.some(face => face.name === 'Imported Brand' && face.tags.includes('weight:700'))).toBe(true)
    await fonts.fetchCustomFonts()
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }]).map(face => face.weight)).toEqual([400, 700])
    expect(document.head.querySelectorAll('style')).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/agency/banner-studio/fonts')).toBe(true)
  })

  it('rejects a failed import refresh instead of proceeding from a stale empty catalog', async () => {
    fetchMock.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Catalog unavailable')).mockResolvedValueOnce([font(1, 400)])
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await expect(fonts.refreshCustomFonts()).rejects.toThrow('Catalog unavailable')
    await expect(fonts.refreshCustomFonts()).resolves.toEqual([font(1, 400)])
  })

  it('reconciles changed font faces when refreshing an existing catalog', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400), font(2, 700)]).mockResolvedValueOnce([font(3, 700)])
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.refreshCustomFonts()
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }]).map(face => face.url)).toEqual([font(3, 700).url])
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(document.head.textContent).not.toContain(font(1, 400).url)
    expect(document.head.textContent).toContain(font(3, 700).url)
  })
  it('switches scoped legacy aliases while preserving exact IDs and one style per face', async () => {
    const a = { ...font(1, 400), clientId: 'client-a' }
    const b = { ...font(2, 400), clientId: 'client-b' }
    fetchMock.mockResolvedValueOnce([a]).mockResolvedValueOnce([b]).mockResolvedValueOnce([a])
    const scope = ref('client-a')
    const fonts = (await import('../../app/composables/useBannerFonts')).useBannerFonts(() => scope.value)
    await fonts.refreshCustomFonts()
    scope.value = 'client-b'
    await fonts.refreshCustomFonts()
    const rawFace = () => [...document.head.querySelectorAll('style')].filter(style => style.textContent.includes('font-family: \'Imported Brand\';'))
    expect(rawFace()).toHaveLength(1)
    expect(rawFace()[0]?.textContent).toContain(b.url)
    expect(fonts.customFonts.value.map(face => face.id)).toEqual([b.id])
    expect(fonts.getExportCustomFonts([{ fontFamily: a.name, fontAssetId: a.id }])[0]?.url).toBe(a.url)
    scope.value = 'client-a'
    await fonts.refreshCustomFonts()
    await fonts.loadCustomFont(a)
    await fonts.loadCustomFont(a)
    expect(rawFace()).toHaveLength(1)
    expect(rawFace()[0]?.textContent).toContain(a.url)
    expect(document.head.querySelectorAll('style')).toHaveLength(2)
    expect(fetchMock.mock.calls.map(call => call[1].query.clientId)).toEqual(['client-a', 'client-b', 'client-a'])
  })
  it('emits exact and legacy CSS names when the same face serves both layers', async () => {
    const face = font(1, 400)
    fetchMock.mockResolvedValueOnce([face])
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    const css = fonts.buildCustomFontsCss([{ fontFamily: face.name }, { fontFamily: face.name, fontAssetId: face.id.toUpperCase() }])
    expect(css).toContain('font-family: \'Imported Brand\';')
    expect(css).toContain('font-family: \'XeroFlowFont_00000000000040008000000000000001\';')
  })
  it('exports legacy client-owned faces before newer shared faces after another client refresh', async () => {
    const a = { ...font(1, 400), clientId: 'client-a' }
    const b = { ...font(2, 400), clientId: 'client-b' }
    const shared = font(3, 400)
    fetchMock.mockResolvedValueOnce([shared, a]).mockResolvedValueOnce([shared, b])
    const create = (await import('../../app/composables/useBannerFonts')).useBannerFonts
    const catalogA = create(() => 'client-a')
    const catalogB = create(() => 'client-b')
    await catalogA.refreshCustomFonts()
    await catalogB.refreshCustomFonts()
    expect(catalogA.getExportCustomFonts([{ fontFamily: a.name }])[0]?.url).toBe(a.url)
    expect(catalogB.getExportCustomFonts([{ fontFamily: b.name }])[0]?.url).toBe(b.url)
  })
})
