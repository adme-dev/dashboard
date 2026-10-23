import { describe, expect, it } from 'vitest'
import { bannerFontWeightOptions } from '../../app/utils/banner-font-weights'

describe('font weight picker', () => {
  it('includes imported faces and the current exact weight once, in numeric order', () => {
    const options = bannerFontWeightOptions([325, 700, 325, 950], 425)
    expect(options.map(item => Number(item.value))).toEqual([300, 325, 400, 425, 500, 600, 700, 800, 900, 950])
    expect(options.find(item => item.value === '325')?.label).toBe('325')
  })
  it('keeps the selected weight visible when the font catalog is still loading', () => {
    expect(bannerFontWeightOptions(undefined, 325).some(item => item.value === '325')).toBe(true)
  })
  it('excludes corrupt catalog weights', () => {
    const options = bannerFontWeightOptions([0, 1001, 325.5, NaN], 400)
    expect(options).toHaveLength(7)
  })
})
