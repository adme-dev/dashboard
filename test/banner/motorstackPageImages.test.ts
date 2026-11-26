import { afterEach, expect, it, vi } from 'vitest'
import { pageImageCatalog } from '../../server/utils/banner/motorstackPageImages'

const binding = { listBrands: async () => ({ schemaVersion: 1, brands: [{ id: 'ldv', name: 'LDV' }] }) }
const page = { page_slug: 'd90', model_name: 'D90', has_content: true, desktop_filename: 'header.webp',
  gallery: [{ filename: 'driving.jpg', alt: 'Driving through the ranges' }, { filename: 'header.webp' }, { filename: '../outside.jpg' }] }

afterEach(() => vi.unstubAllGlobals())
it('loads branded header and gallery artwork from mirrored files and excludes hidden or retired pages', async () => {
  vi.stubGlobal('fetch', async (url: string) => Response.json(url.includes('/config/') ? { hidden: ['ldv/hidden'] } : {
    pages: [page, { ...page, page_slug: 'hidden', model_name: 'Hidden' }, { ...page, retired: true, model_name: 'Retired' }]
  }))
  const lifestyle = await pageImageCatalog(binding, 'ldv', 'lifestyle')
  expect(lifestyle.models).toEqual(['D90'])
  expect(lifestyle.assets).toHaveLength(1)
  expect(lifestyle.assets[0]).toMatchObject({ name: 'D90 · Driving through the ranges', previewUrl: 'https://motorstackmedia.driveagent.io/ldv/pagepacks/images/driving.jpg' })
  const headers = await pageImageCatalog(binding, 'ldv', 'headers', 'D90')
  expect(headers.assets.map(asset => asset.name)).toEqual(['D90 · Desktop header'])
  expect((await pageImageCatalog(binding, 'ldv', 'headers', 'Other')).assets).toEqual([])
})
it('checks MotorStack brand access before loading published media', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(pageImageCatalog(binding, 'other', 'headers')).rejects.toMatchObject({ statusCode: 403 })
  expect(fetch).not.toHaveBeenCalled()
})
