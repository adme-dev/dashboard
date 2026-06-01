import { describe, it, expect } from 'vitest'
import { resolveComposerContent, composerToBody, emptyComposerState } from '../../app/composables/useSocialComposer'

describe('resolveComposerContent', () => {
  const base = { ...emptyComposerState(), content: 'Base', mediaUrls: ['a.jpg'] }

  it('returns base when customization is off, even if an override exists', () => {
    const s = { ...base, customizePerNetwork: false, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'instagram')).toEqual({ content: 'Base', mediaUrls: ['a.jpg'] })
  })
  it('applies an override only when customization is on', () => {
    const s = { ...base, customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'instagram')).toEqual({ content: 'IG', mediaUrls: ['a.jpg'] })
  })
  it('inherits base for a platform without an override', () => {
    const s = { ...base, customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'facebook')).toEqual({ content: 'Base', mediaUrls: ['a.jpg'] })
  })
})

describe('composerToBody', () => {
  it('omits overrides when customization is off and nulls empty arrays', () => {
    const s = { ...emptyComposerState(), content: 'hi', platforms: ['facebook' as const], platformOverrides: { x: {} } }
    const body = composerToBody(s, 'C1')
    expect(body.clientId).toBe('C1')
    expect(body.platformOverrides).toEqual({})
    expect(body.mediaUrls).toBeNull()
    expect(body.tags).toBeNull()
  })
  it('drops scheduledAt in "now" mode', () => {
    const s = { ...emptyComposerState(), scheduleMode: 'now' as const, scheduledAt: '2026-06-10T00:00:00Z' }
    expect(composerToBody(s, 'C1').scheduledAt).toBeNull()
  })
  it('keeps scheduledAt in schedule mode and includes overrides when on', () => {
    const s = { ...emptyComposerState(), scheduleMode: 'schedule' as const, scheduledAt: '2026-06-10T00:00:00Z',
      customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    const body = composerToBody(s, 'C1')
    expect(body.scheduledAt).toBe('2026-06-10T00:00:00Z')
    expect(body.platformOverrides).toEqual({ instagram: { content: 'IG' } })
  })
})
