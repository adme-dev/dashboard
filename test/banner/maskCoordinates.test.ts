import { describe, expect, it } from 'vitest'
import { computeAnimatedClipPath } from '../../app/utils/banner-mask'
const rect = { x: 0, y: 0, w: 200, h: 100 }
const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
describe('animated mask coordinates', () => {
  it('converts a mask over a doubled target into target-local pixels', () => {
    expect(computeAnimatedClipPath(rect, rect, transform, { ...transform, scaleX: 2 }, 'rect', false)).toBe('inset(0px 50px 0px 50px)')
  })
  it('keeps a collapsed mask collapsed instead of replacing zero scale with one', () => {
    expect(computeAnimatedClipPath(rect, rect, { ...transform, scaleX: 0 }, transform, 'rect', false)).toBe('inset(0px 100px 0px 100px)')
  })
  it('handles translated and mirrored targets without negative mask sizes', () => {
    expect(computeAnimatedClipPath(rect, rect, transform, { ...transform, scaleX: -2, x: 100 }, 'rect', false)).toBe('inset(0px 0px 0px 100px)')
  })
})
