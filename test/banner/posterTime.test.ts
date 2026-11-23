import { expect, it } from 'vitest'
import { bannerPosterTime } from '~~/shared/bannerPosterTime'

import type { Layer } from '~/types/banner-studio'

it('bounds explicit poster choices and retains automatic timing when unset or invalid', () => {
  expect(bannerPosterTime(6, 1.5)).toBe(1.5)
  expect(bannerPosterTime(6, 90)).toBe(5.999)
  expect(bannerPosterTime(6, -1)).toBe(0)
  expect(bannerPosterTime(6, NaN)).toBe(3)
  expect(bannerPosterTime(2)).toBe(1)
  expect(bannerPosterTime(NaN)).toBe(2.5)
})
const text = (extra: Partial<Layer> = {}): Layer => ({ id: 1, type: 'text', text: 'Offer and legal copy', opacity: 1, startTime: 0, endTime: 6, animIn: 'none', ...extra }) as Layer

it('avoids blank opening frames, long entrances and exit fades without changing a manual choice', () => {
  const layers = [text({ startTime: 3.5, keyframes: { opacity: [{ time: 3.5, value: 0 }, { time: 4, value: 1 }, { time: 5, value: 1 }, { time: 6, value: 0 }] } })]
  const selected = bannerPosterTime(6, undefined, layers)
  expect(selected).toBeGreaterThan(4)
  expect(selected).toBeLessThan(5)
  expect(bannerPosterTime(6, 0, layers)).toBe(0)
  expect(bannerPosterTime(6, 1.5, layers)).toBe(1.5)
})

it('waits for words to settle and avoids a pulsing offer', () => {
  const layers = [text({ wordPop: { duration: 0.5, stagger: 0.3, ease: 'linear' }, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 1.5, value: 0.2 }, { time: 3.5, value: 1 }, { time: 6, value: 1 }] } })]
  expect(bannerPosterTime(6, undefined, layers)).toBeGreaterThanOrEqual(3.5)
})

it('ignores hidden copy, masks and audio, and chooses useful content in a later scene', () => {
  const layers = [text({ text: 'Hi', endTime: 1 }), text({ id: 2, text: 'A complete offer with contact and legal details', startTime: 4 }), text({ id: 3, hidden: true, startTime: 20 }), text({ id: 4, type: 'audio', startTime: 30 })]
  expect(bannerPosterTime(6, undefined, layers)).toBeGreaterThan(4.15)
  expect(bannerPosterTime(0.0001, 4)).toBe(0)
  expect(bannerPosterTime(Infinity)).toBe(2.5)
})

it('keeps a substantial picture in the poster instead of selecting a copy-only tail', () => {
  const layers = [text({ id: 2, text: 'Offer', endTime: 4 }), text({ id: 3, text: 'Contact details and extra legal copy at the end of the animation', startTime: 4 }), text({ id: 4, type: 'video', text: undefined, w: 100, h: 100, endTime: 4 })]
  expect(bannerPosterTime(6, undefined, layers)).toBeLessThan(4)
})
