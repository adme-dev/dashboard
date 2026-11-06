import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isStoryboardFeatureEnabled } from '../../shared/video/storyboardFeaturePolicy'

describe('shared storyboard feature policy', () => {
  it.each([[undefined, true], ['true', true], ['false', false], ['', false], [true, false], [null, false]])('resolves %s to %s', (value, expected) => {
    expect(isStoryboardFeatureEnabled(value)).toBe(expected)
  })
  it('uses the same policy for the public build default', () => {
    const source = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(source).toContain('videoStoryboardEnabled: isStoryboardFeatureEnabled(process.env.VIDEO_STORYBOARD_ENABLED)')
  })
})
