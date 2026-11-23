import { expect, it } from 'vitest'
import { bannerPosterTime } from '~~/shared/bannerPosterTime'

it('bounds explicit poster choices and retains automatic timing when unset or invalid', () => {
  expect(bannerPosterTime(6, 1.5)).toBe(1.5)
  expect(bannerPosterTime(6, 90)).toBe(5.999)
  expect(bannerPosterTime(6, -1)).toBe(0)
  expect(bannerPosterTime(6, NaN)).toBe(3)
  expect(bannerPosterTime(2)).toBe(1)
  expect(bannerPosterTime(NaN)).toBe(2.5)
})
