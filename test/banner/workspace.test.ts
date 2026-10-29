import { expect, it } from 'vitest'
import { layoutRows, fitLayoutRows, layoutName } from '../../app/utils/banner-workspace'
import { resolveBannerFormat } from '../../app/utils/banner-constants'

it('groups square and story together, with landscape below, without changing source order', () => {
  const formats = ['custom_1080x1920', 'custom_1920x1080', 'custom_1200x1200'].map(key => resolveBannerFormat(key)!)
  const rows = layoutRows(formats)
  expect(rows.map(row => row.map(f => f.key))).toEqual([['custom_1200x1200', 'custom_1080x1920'], ['custom_1920x1080']])
  expect(formats[0].key).toBe('custom_1080x1920')
  const scale = fitLayoutRows(rows, 1000, 1400)
  expect(2280 * scale + 64 + 64).toBeLessThanOrEqual(1000)
  expect(3000 * scale + 128 + 64 + 64).toBeLessThanOrEqual(1400)
  expect(scale).toBeGreaterThan(0.3)
  expect(rows.flat().map(layoutName)).toEqual(['Square post', 'Story', 'Full HD landscape'])
})

it('keeps known platform names and safely handles an empty canvas', () => {
  expect(layoutName(resolveBannerFormat('fb_story')!)).toBe('Story')
  expect(fitLayoutRows([], 0, 0)).toBe(1)
})
