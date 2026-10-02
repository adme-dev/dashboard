import { describe, expect, it, vi } from 'vitest'
import { setCachedCfBindings } from '../../server/utils/cfBindings'
import { videoFeatureEnabled } from '../../server/utils/video-generation/features'

vi.mock('~~/server/utils/cfBindings', async () => await import('../../server/utils/cfBindings'))

describe('video feature request bindings', () => {
  it('reads Nitro platform bindings on a cold request before authentication promotes them', () => {
    setCachedCfBindings({ VIDEO_STUDIO_ENABLED: 'false' })
    const event = { context: { _platform: { cloudflare: { env: { VIDEO_STUDIO_ENABLED: 'true' } } } } }
    expect(videoFeatureEnabled('VIDEO_STUDIO_ENABLED', event as Parameters<typeof videoFeatureEnabled>[1])).toBe(true)
  })
  it('honours explicit request disable over a previously enabled isolate', () => {
    setCachedCfBindings({ VIDEO_STUDIO_ENABLED: 'true' })
    const event = { context: { _platform: { cloudflare: { env: { VIDEO_STUDIO_ENABLED: 'false' } } } } }
    expect(videoFeatureEnabled('VIDEO_STUDIO_ENABLED', event as Parameters<typeof videoFeatureEnabled>[1])).toBe(false)
  })
})
