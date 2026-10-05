// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, readonly, ref } from 'vue'
import type { CustomFont } from '../../app/composables/useBannerFonts'

const font = (id: number, weight: number): CustomFont => ({
  id, name: 'Imported Brand', mimeType: 'font/woff2', fileSize: 12, r2Key: `font-${id}.woff2`,
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
  it('exports a newly uploaded font after an empty catalog has already been cached', async () => {
    fetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(font(1, 700))
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'brand.woff2'), 'Imported Brand', 700)
    await fonts.fetchCustomFonts()
    const upload = fetchMock.mock.calls[1][1].body as FormData
    expect(upload.get('family')).toBe('Imported Brand')
    expect(upload.get('weight')).toBe('700')
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }])).toEqual([{ family: 'Imported Brand', url: font(1, 700).url, weight: 700, format: 'woff2' }])
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

  it('replaces an uploaded family weight without affecting another weight', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400), font(2, 700)]).mockResolvedValueOnce(font(3, 700))
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'replacement.woff2'), 'Imported Brand', 700)
    expect(fonts.getExportCustomFonts([{ fontFamily: 'Imported Brand' }]).map(f => f.url)).toEqual([font(3, 700).url, font(1, 400).url])
    expect(document.head.querySelectorAll('style')).toHaveLength(2)
    expect(document.head.textContent).toContain(font(3, 700).url)
    expect(document.head.textContent).not.toContain(font(2, 700).url)
  })

  it('preserves the existing upload call without a weight and removes only the deleted face', async () => {
    fetchMock.mockResolvedValueOnce([font(1, 400)]).mockResolvedValueOnce(font(2, 700)).mockResolvedValueOnce({})
    const fonts = await catalog()
    await fonts.fetchCustomFonts()
    await fonts.uploadCustomFont(new File(['font'], 'brand.woff2'))
    expect((fetchMock.mock.calls[1][1].body as FormData).has('weight')).toBe(false)
    await fonts.deleteCustomFont(2)
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
})
