import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isPublicVideoFeatureEnabled } from '../../shared/video/publicFeaturePolicy'

describe('public video release policy', () => {
  it.each([[undefined, true], ['true', true], ['false', false], ['', false], ['TRUE', false], [true, false], [null, false]])('resolves %s to %s', (value, expected) => {
    expect(isPublicVideoFeatureEnabled(value)).toBe(expected)
  })

  it('preserves enabled public video discovery when normal release inputs are absent', () => {
    const source = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(source).toContain('videoStudioEnabled: isPublicVideoFeatureEnabled(process.env.VIDEO_STUDIO_ENABLED)')
    expect(source).toContain('videoGenerationEnabled: isPublicVideoFeatureEnabled(process.env.VIDEO_GENERATION_ENABLED)')
    expect(source).toContain("videoAssetHarnessEnabled: process.env.VIDEO_ASSET_HARNESS_ENABLED === 'true' || isPublicVideoFeatureEnabled(process.env.VIDEO_GENERATION_ENABLED)")
  })
})
